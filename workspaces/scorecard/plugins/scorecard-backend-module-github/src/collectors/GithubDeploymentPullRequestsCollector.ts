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

export class GithubDeploymentPullRequestsCollector
  implements
    Collector<
      (typeof GithubDeploymentPullRequestsCollector)['inputSchema'],
      (typeof GithubDeploymentPullRequestsCollector)['outputSchema']
    >
{
  static readonly inputSchema = z.object({
    commitSha: z.string().min(1),
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

  static fromConfig(config: Config): GithubDeploymentPullRequestsCollector {
    return new GithubDeploymentPullRequestsCollector(config);
  }

  getCollectorId(): string {
    return 'github:deployment-pull-requests';
  }

  getCollectorDescription(): string {
    return 'Collect GitHub pull requests linked to a deployment commit SHA';
  }

  getInputSchema() {
    return GithubDeploymentPullRequestsCollector.inputSchema;
  }

  getOutputSchema() {
    return GithubDeploymentPullRequestsCollector.outputSchema;
  }

  async collect(options: {
    entity: Entity;
    input: z.infer<
      (typeof GithubDeploymentPullRequestsCollector)['inputSchema']
    >;
  }): Promise<
    z.infer<(typeof GithubDeploymentPullRequestsCollector)['outputSchema']>
  > {
    const repository = getRepositoryInformationFromEntity(options.entity);
    const { target } = getEntitySourceLocation(options.entity);

    const pullRequests = await this.client.getCommitPullRequests(
      target,
      repository,
      options.input.commitSha,
    );

    return {
      pullRequests: pullRequests.map(pullRequest => ({
        id: String(pullRequest.number),
        mergedAt: pullRequest.mergedAt,
      })),
    };
  }
}
