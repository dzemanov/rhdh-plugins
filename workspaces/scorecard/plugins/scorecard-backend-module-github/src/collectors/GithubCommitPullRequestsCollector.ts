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

export class GithubCommitPullRequestsCollector
  implements
    Collector<
      (typeof GithubCommitPullRequestsCollector)['inputSchema'],
      (typeof GithubCommitPullRequestsCollector)['outputSchema']
    >
{
  static readonly inputSchema = z.object({
    sha: z.string().min(1),
  });
  static readonly outputSchema = z.object({
    pullRequests: z.array(
      z.object({
        number: z.number(),
        mergedAt: z.string().nullable(),
      }),
    ),
  });

  private readonly client: GithubClient;

  private constructor(config: Config) {
    this.client = new GithubClient(config);
  }

  static fromConfig(config: Config): GithubCommitPullRequestsCollector {
    return new GithubCommitPullRequestsCollector(config);
  }

  getCollectorId(): string {
    return 'github:commit-pull-requests';
  }

  getCollectorDescription(): string {
    return 'Collect GitHub pull requests linked to a commit SHA';
  }

  getInputSchema() {
    return GithubCommitPullRequestsCollector.inputSchema;
  }

  getOutputSchema() {
    return GithubCommitPullRequestsCollector.outputSchema;
  }

  async collect(options: {
    entity: Entity;
    input: z.infer<(typeof GithubCommitPullRequestsCollector)['inputSchema']>;
  }): Promise<
    z.infer<(typeof GithubCommitPullRequestsCollector)['outputSchema']>
  > {
    const repository = getRepositoryInformationFromEntity(options.entity);
    const { target } = getEntitySourceLocation(options.entity);

    const pullRequests = await this.client.getCommitPullRequests(
      target,
      repository,
      options.input.sha,
    );

    return {
      pullRequests,
    };
  }
}
