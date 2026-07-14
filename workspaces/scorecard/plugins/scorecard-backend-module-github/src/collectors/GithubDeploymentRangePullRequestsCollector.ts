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

import type { Entity } from '@backstage/catalog-model';
import { getEntitySourceLocation } from '@backstage/catalog-model';
import type { Config } from '@backstage/config';
import type { Collector } from '@red-hat-developer-hub/backstage-plugin-scorecard-node';
import { z } from 'zod';
import { GithubClient } from '../github/GithubClient';
import { getRepositoryInformationFromEntity } from '../github/utils';

export class GithubDeploymentRangePullRequestsCollector
  implements
    Collector<
      (typeof GithubDeploymentRangePullRequestsCollector)['inputSchema'],
      (typeof GithubDeploymentRangePullRequestsCollector)['outputSchema']
    >
{
  static readonly inputSchema = z.object({
    baseCommitSha: z.string().min(1),
    headCommitSha: z.string().min(1),
  });
  static readonly outputSchema = z.object({
    pullRequests: z.array(
      z.object({
        id: z.string(),
        mergedAt: z.string().nullable(),
      }),
    ),
  });

  private readonly client: GithubClient;

  private constructor(config: Config) {
    this.client = new GithubClient(config);
  }

  static fromConfig(
    config: Config,
  ): GithubDeploymentRangePullRequestsCollector {
    return new GithubDeploymentRangePullRequestsCollector(config);
  }

  getCollectorId(): string {
    return 'github:deploymentRangePullRequests';
  }

  getCollectorDescription(): string {
    return 'Collect GitHub pull requests included in a deployment commit range';
  }

  getInputSchema() {
    return GithubDeploymentRangePullRequestsCollector.inputSchema;
  }

  getOutputSchema() {
    return GithubDeploymentRangePullRequestsCollector.outputSchema;
  }

  async collect(options: {
    entity: Entity;
    input: z.infer<
      (typeof GithubDeploymentRangePullRequestsCollector)['inputSchema']
    >;
  }): Promise<
    z.infer<(typeof GithubDeploymentRangePullRequestsCollector)['outputSchema']>
  > {
    const repository = getRepositoryInformationFromEntity(options.entity);
    const { target } = getEntitySourceLocation(options.entity);

    const commitShas = await this.client.getCommitShasBetween(
      target,
      repository,
      options.input.baseCommitSha,
      options.input.headCommitSha,
    );

    const pullRequestsById = new Map<
      string,
      { id: string; mergedAt: string | null }
    >();
    for (const commitSha of commitShas) {
      const commitPullRequests = await this.client.getCommitPullRequests(
        target,
        repository,
        commitSha,
      );

      for (const pullRequest of commitPullRequests) {
        const pullRequestId = String(pullRequest.number);
        if (pullRequestsById.has(pullRequestId)) {
          continue;
        }

        pullRequestsById.set(pullRequestId, {
          id: pullRequestId,
          mergedAt: pullRequest.mergedAt,
        });
      }
    }

    return {
      pullRequests: Array.from(pullRequestsById.values()),
    };
  }
}
