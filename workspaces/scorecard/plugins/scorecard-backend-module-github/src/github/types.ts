import { GraphQlQueryResponseData } from '@octokit/graphql';

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
export type GithubRepository = {
  owner: string;
  repo: string;
};

export type GithubDeployment = {
  id: number;
  sha: string;
  createdAt: string;
  environment: string;
  status: string;
};

export type GithubPullRequest = {
  number: number;
  mergedAt: string | null;
};

export type GithubDeploymentsQueryResponse = GraphQlQueryResponseData & {
  repository: {
    deployments: {
      nodes: Array<{
        databaseId?: number | null;
        commitOid?: string | null;
        createdAt: string;
        environment?: string | null;
        latestStatus?: {
          state?: string | null;
        } | null;
      }>;
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
    };
  };
};

export type GithubCommitPullRequestsQueryResponse = GraphQlQueryResponseData & {
  repository: {
    object?: {
      associatedPullRequests?: {
        nodes: Array<{
          number: number;
          mergedAt?: string | null;
        }>;
      };
    } | null;
  };
};
