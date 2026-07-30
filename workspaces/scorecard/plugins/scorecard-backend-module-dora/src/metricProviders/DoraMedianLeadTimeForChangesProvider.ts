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
import type { Entity } from '@backstage/catalog-model';
import { Metric } from '@red-hat-developer-hub/backstage-plugin-scorecard-common';
import {
  type ScorecardCollectorsService,
  MetricProvider,
} from '@red-hat-developer-hub/backstage-plugin-scorecard-node';
import {
  DORA_DEFAULT_DEPLOYMENTS_COLLECTOR_ID,
  DORA_DEFAULT_DEPLOYMENT_RANGE_PULL_REQUESTS_COLLECTOR_ID,
  DORA_TIME_WINDOW_DAYS,
} from '../constants';
import {
  rangePullRequestsCollectorInputSchema,
  rangePullRequestsCollectorOutputSchema,
} from './schemas/pullRequestSchemas';
import {
  deploymentsCollectorInputSchema,
  deploymentsCollectorOutputSchema,
} from './schemas/deploymentSchemas';
import { calculateMedian } from './utils/calculationUtils';
import { DEFAULT_DORA_MEDIAN_LEAD_TIME_THRESHOLDS } from './DoraConfig';
import { CATALOG_FILTER_EXISTS } from '@backstage/catalog-client';

type DoraMedianLeadTimeForChangesProviderOptions = {
  collectorsService: ScorecardCollectorsService;
  deploymentsCollectorId: string;
  deploymentRangePullRequestsCollectorId: string;
  deploymentsCollectorInput: Record<string, unknown>;
  deploymentRangePullRequestsCollectorInput: Record<string, unknown>;
};

export class DoraMedianLeadTimeForChangesProvider
  implements MetricProvider<'number'>
{
  private readonly collectorsService: ScorecardCollectorsService;
  private readonly deploymentsCollectorId: string;
  private readonly deploymentRangePullRequestsCollectorId: string;
  private readonly deploymentsCollectorInput: Record<string, unknown>;
  private readonly deploymentRangePullRequestsCollectorInput: Record<
    string,
    unknown
  >;

  private constructor(options: DoraMedianLeadTimeForChangesProviderOptions) {
    this.collectorsService = options.collectorsService;
    this.deploymentsCollectorId = options.deploymentsCollectorId;
    this.deploymentRangePullRequestsCollectorId =
      options.deploymentRangePullRequestsCollectorId;
    this.deploymentsCollectorInput = options.deploymentsCollectorInput;
    this.deploymentRangePullRequestsCollectorInput =
      options.deploymentRangePullRequestsCollectorInput;
  }

  static fromConfig(
    config: Config,
    options: {
      collectorsService: ScorecardCollectorsService;
    },
  ): DoraMedianLeadTimeForChangesProvider {
    return new DoraMedianLeadTimeForChangesProvider({
      collectorsService: options.collectorsService,
      deploymentsCollectorId:
        config.getOptionalString(
          'scorecard.plugins.dora.medianLeadTimeForChanges.collectors.deployments.id',
        ) ?? DORA_DEFAULT_DEPLOYMENTS_COLLECTOR_ID,
      deploymentRangePullRequestsCollectorId:
        config.getOptionalString(
          'scorecard.plugins.dora.medianLeadTimeForChanges.collectors.deploymentRangePullRequests.id',
        ) ?? DORA_DEFAULT_DEPLOYMENT_RANGE_PULL_REQUESTS_COLLECTOR_ID,
      deploymentsCollectorInput:
        config.getOptional<Record<string, unknown>>(
          'scorecard.plugins.dora.medianLeadTimeForChanges.collectors.deployments.input',
        ) ?? {},
      deploymentRangePullRequestsCollectorInput:
        config.getOptional<Record<string, unknown>>(
          'scorecard.plugins.dora.medianLeadTimeForChanges.collectors.deploymentRangePullRequests.input',
        ) ?? {},
    });
  }

  getProviderDatasourceId(): string {
    return 'dora';
  }

  getProviderId() {
    return 'dora.medianLeadTimeForChanges';
  }

  getMetrics(): Metric<'number'>[] {
    return [
      {
        id: this.getProviderId(),
        title: 'DORA - Median Lead Time for Changes',
        description:
          'Measures the time from code commit to production deployment over the past 30 days. Elite performers have a lead time of less than one hour',
        type: 'number',
        thresholds: DEFAULT_DORA_MEDIAN_LEAD_TIME_THRESHOLDS,
        history: true,
      },
    ];
  }

  getCatalogFilter(): Record<string, string | symbol | (string | symbol)[]> {
    return {
      'metadata.annotations.scorecard.io/dora': CATALOG_FILTER_EXISTS,
    };
  }

  async calculateMetrics(entity: Entity): Promise<Map<string, number>> {
    const results = new Map<string, number>();
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - DORA_TIME_WINDOW_DAYS);

    const deploymentsCollected = await this.collectorsService.collect<
      typeof deploymentsCollectorInputSchema,
      typeof deploymentsCollectorOutputSchema
    >({
      collectorId: this.deploymentsCollectorId,
      contract: {
        inputSchema: deploymentsCollectorInputSchema,
        outputSchema: deploymentsCollectorOutputSchema,
      },
      entity,
      input: {
        ...this.deploymentsCollectorInput,
        from: from.toISOString(),
        to: to.toISOString(),
      },
    });

    // Deployments are expected to be returned sorted ascending by createdAt.
    const deployments = deploymentsCollected.deployments.filter(deployment => {
      // Only successful deployments count
      if (deployment.result !== 'success') {
        return false;
      }
      // Only deplyoments to production environment count, treat unknown environment as production
      if (
        deployment.environment &&
        deployment.environment.toLowerCase() !== 'production'
      ) {
        return false;
      }

      return true;
    });

    if (deployments.length < 2) {
      results.set(this.getProviderId(), 0);
      return results;
    }

    const leadTimeHours: number[] = [];
    for (
      let deploymentIndex = 1;
      deploymentIndex < deployments.length;
      deploymentIndex++
    ) {
      const previousDeployment = deployments[deploymentIndex - 1];
      const deployment = deployments[deploymentIndex];

      const pullRequestsCollected = await this.collectorsService.collect<
        typeof rangePullRequestsCollectorInputSchema,
        typeof rangePullRequestsCollectorOutputSchema
      >({
        collectorId: this.deploymentRangePullRequestsCollectorId,
        contract: {
          inputSchema: rangePullRequestsCollectorInputSchema,
          outputSchema: rangePullRequestsCollectorOutputSchema,
        },
        entity,
        input: {
          ...this.deploymentRangePullRequestsCollectorInput,
          baseCommitSha: previousDeployment.commitSha,
          headCommitSha: deployment.commitSha,
        },
      });

      const deployedAtTimestamp = new Date(deployment.createdAt).getTime();
      for (const pullRequest of pullRequestsCollected.pullRequests) {
        const firstCommitAtTimestamp = new Date(
          pullRequest.firstCommitAt,
        ).getTime();
        if (deployedAtTimestamp < firstCommitAtTimestamp) {
          continue;
        }
        leadTimeHours.push(
          (deployedAtTimestamp - firstCommitAtTimestamp) / 3_600_000,
        );
      }
    }

    if (leadTimeHours.length === 0) {
      results.set(this.getProviderId(), 0);
      return results;
    }

    const median = calculateMedian(leadTimeHours);
    results.set(this.getProviderId(), Number(median.toFixed(4)));
    return results;
  }
}
