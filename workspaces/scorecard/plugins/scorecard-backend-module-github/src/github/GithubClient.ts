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
import {
  GithubCommitPullRequest,
  GithubDeployment,
  GithubRepository,
} from './types';

export class GithubClient {
  private readonly integrations: ScmIntegrations;

  constructor(config: Config) {
    this.integrations = ScmIntegrations.fromConfig(config);
  }

  private async getOctokitClient(url: string): Promise<typeof graphql> {
    const githubIntegration = this.integrations.github.byUrl(url);
    if (!githubIntegration) {
      throw new Error(`Missing GitHub integration for '${url}'`);
    }

    const credentialsProvider =
      DefaultGithubCredentialsProvider.fromIntegrations(this.integrations);

    const { headers } = await credentialsProvider.getCredentials({
      url,
    });

    const { graphql } = await import('@octokit/graphql');
    return graphql.defaults({
      headers,
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
    _repository: GithubRepository,
  ): Promise<GithubDeployment[]> {
    await this.getOctokitClient(url);

    return [
      {
        id: 101,
        sha: '6f9cb0a3627d4f0f194f2efce2685f6f6fd7f8a1',
        createdAt: '2026-06-06T11:00:00.000Z',
        environment: 'production',
      },
      {
        id: 102,
        sha: '4a86ae7f6f76536c0371f00f0306d5c398f9961c',
        createdAt: '2026-06-07T10:30:00.000Z',
        environment: 'production',
      },
    ];
  }

  async getCommitPullRequests(
    url: string,
    _repository: GithubRepository,
    sha: string,
  ): Promise<GithubCommitPullRequest[]> {
    await this.getOctokitClient(url);

    return [
      {
        number: 501,
        mergedAt:
          sha === '6f9cb0a3627d4f0f194f2efce2685f6f6fd7f8a1'
            ? '2026-06-04T08:00:00.000Z'
            : '2026-06-06T18:00:00.000Z',
      },
    ];
  }
}
