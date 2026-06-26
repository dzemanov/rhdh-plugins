/*
 * Copyright Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { Config } from '@backstage/config';
import {
  DefaultGithubCredentialsProvider,
  ScmIntegrations,
} from '@backstage/integration';
import { Octokit } from '@octokit/rest';
import {
  GithubDeployment,
  GithubWorkflowRun,
  GithubPullRequest,
  GithubRepository,
  GithubDeploymentsQueryResponse,
  GithubCommitPullRequestsQueryResponse,
} from './types';

export class GithubClient {
  private readonly integrations: ScmIntegrations;
  private readonly credentialsProvider: DefaultGithubCredentialsProvider;

  constructor(config: Config) {
    this.integrations = ScmIntegrations.fromConfig(config);
    this.credentialsProvider =
      DefaultGithubCredentialsProvider.fromIntegrations(this.integrations);
  }

  private async getOctokitClient(url: string): Promise<typeof graphql> {
    const githubIntegration = this.integrations.github.byUrl(url);
    if (!githubIntegration) {
      throw new Error(`Missing GitHub integration for '${url}'`);
    }

    const { headers } = await this.credentialsProvider.getCredentials({
      url,
    });

    const { graphql } = await import('@octokit/graphql');
    return graphql.defaults({
      headers,
      baseUrl: githubIntegration.config.apiBaseUrl,
    });
  }

  private async getOctokitRestClient(url: string): Promise<Octokit> {
    const githubIntegration = this.integrations.github.byUrl(url);
    if (!githubIntegration) {
      throw new Error(`Missing GitHub integration for '${url}'`);
    }

    const { token } = await this.credentialsProvider.getCredentials({
      url,
    });

    return new Octokit({
      auth: token,
      baseUrl: githubIntegration.config.apiBaseUrl,
    });
  }

  async getOpenPullRequestsCount(
    url: string,
    repository: GithubRepository,
  ): Promise<number> {
    const octokit = await this.getOctokitClient(url);

    const query = `
      query getOpenPRsCount($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          pullRequests(states: OPEN) {
            totalCount
          }
        }
      }
    `;

    const response = await octokit<{
      repository: {
        pullRequests: {
          totalCount: number;
        };
      };
    }>(query, {
      owner: repository.owner,
      repo: repository.repo,
    });

    return response.repository.pullRequests.totalCount;
  }

  async getDeployments(
    url: string,
    repository: GithubRepository,
    from: Date,
    to: Date,
  ): Promise<GithubDeployment[]> {
    const octokit = await this.getOctokitClient(url);
    const deployments: GithubDeployment[] = [];
    const query = `
      query getDeployments($owner: String!, $repo: String!, $after: String) {
        repository(owner: $owner, name: $repo) {
          deployments(
            first: 100
            orderBy: { field: CREATED_AT, direction: DESC }
            after: $after
          ) {
            nodes {
              databaseId
              commitOid
              createdAt
              environment
              latestStatus {
                state
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    `;
    const fromTimestamp = from.getTime();
    const toTimestamp = to.getTime();
    let after: string | null = null;
    let hasMorePages = true;
    let reachedOlderThanWindow = false;

    while (hasMorePages) {
      const response: GithubDeploymentsQueryResponse = await octokit(query, {
        owner: repository.owner,
        repo: repository.repo,
        after,
      });

      const pageDeployments = response.repository.deployments.nodes;

      if (pageDeployments.length === 0) {
        break;
      }

      for (const deployment of pageDeployments) {
        if (!deployment.databaseId || !deployment.commitOid) {
          continue;
        }

        const deployedAt = Date.parse(deployment.createdAt);
        if (Number.isNaN(deployedAt)) {
          continue;
        }

        if (deployedAt < fromTimestamp) {
          reachedOlderThanWindow = true;
        }

        if (deployedAt >= fromTimestamp && deployedAt <= toTimestamp) {
          deployments.push({
            id: deployment.databaseId,
            sha: deployment.commitOid,
            createdAt: deployment.createdAt,
            environment: deployment.environment ?? null,
            status: deployment.latestStatus?.state ?? null,
          });
        }
      }

      hasMorePages =
        !reachedOlderThanWindow &&
        response.repository.deployments.pageInfo.hasNextPage;
      after = response.repository.deployments.pageInfo.endCursor;
    }

    return deployments;
  }

  async getCommitPullRequests(
    url: string,
    repository: GithubRepository,
    sha: string,
  ): Promise<GithubPullRequest[]> {
    const octokit = await this.getOctokitClient(url);
    const query = `
      query getCommitPullRequests($owner: String!, $repo: String!, $sha: String!) {
        repository(owner: $owner, name: $repo) {
          object(expression: $sha) {
            ... on Commit {
              associatedPullRequests(first: 50) {
                nodes {
                  number
                  mergedAt
                }
              }
            }
          }
        }
      }
    `;

    const response = await octokit<GithubCommitPullRequestsQueryResponse>(
      query,
      {
        owner: repository.owner,
        repo: repository.repo,
        sha,
      },
    );

    const pullRequests =
      response.repository.object?.associatedPullRequests?.nodes ?? [];

    return pullRequests.map(pr => ({
      number: pr.number,
      mergedAt: pr.mergedAt ?? null,
    }));
  }

  async getWorkflowRuns(
    url: string,
    repository: GithubRepository,
    workflowName: string,
    from: Date,
    to: Date,
  ): Promise<GithubWorkflowRun[]> {
    const octokit = await this.getOctokitRestClient(url);

    const workflows = await octokit.paginate(
      octokit.actions.listRepoWorkflows,
      { owner: repository.owner, repo: repository.repo, per_page: 100 },
      response => response.data,
    );

    const workflow = workflows.find(
      item =>
        item.name === workflowName ||
        item.path === workflowName ||
        item.path.endsWith(`/${workflowName}`),
    );

    if (!workflow) {
      throw new Error(
        `Workflow '${workflowName}' was not found in '${repository.owner}/${repository.repo}'`,
      );
    }

    const workflowRuns = await octokit.paginate(
      octokit.actions.listWorkflowRuns,
      {
        owner: repository.owner,
        repo: repository.repo,
        workflow_id: workflow.id,
        created: `${from.toISOString()}..${to.toISOString()}`,
        per_page: 100,
      },
      response =>
        response.data.map(run => ({
          id: run.id,
          sha: run.head_sha,
          createdAt: run.created_at,
          status: run.status ?? null,
          conclusion: run.conclusion ?? null,
        })),
    );

    return workflowRuns;
  }
}
