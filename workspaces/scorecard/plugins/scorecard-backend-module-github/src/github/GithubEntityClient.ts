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
import { getEntitySourceLocation, type Entity } from '@backstage/catalog-model';
import { GithubClient } from './GithubClient';
import {
  GithubCommitPullRequest,
  GithubDeployment,
  GithubRepository,
} from './types';
import { getRepositoryInformationFromEntity } from './utils';

export class GithubEntityClient {
  constructor(private readonly githubClient: GithubClient) {}

  private resolveEntityContext(entity: Entity): {
    url: string;
    repository: GithubRepository;
  } {
    const repository = getRepositoryInformationFromEntity(entity);
    const { target } = getEntitySourceLocation(entity);

    return {
      url: target,
      repository,
    };
  }

  forEntity(entity: Entity): {
    getOpenPullRequestsCount(): Promise<number>;
    getDeployments(from: Date, to: Date): Promise<GithubDeployment[]>;
    getCommitPullRequests(sha: string): Promise<GithubCommitPullRequest[]>;
  } {
    const { url, repository } = this.resolveEntityContext(entity);

    return {
      getOpenPullRequestsCount: () =>
        this.githubClient.getOpenPullRequestsCount(url, repository),
      getDeployments: (from: Date, to: Date) =>
        this.githubClient.getDeployments(url, repository, from, to),
      getCommitPullRequests: (sha: string) =>
        this.githubClient.getCommitPullRequests(url, repository, sha),
    };
  }
}
