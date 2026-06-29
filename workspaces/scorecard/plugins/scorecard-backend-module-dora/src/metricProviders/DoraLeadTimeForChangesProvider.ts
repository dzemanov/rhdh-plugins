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
import {
  DEFAULT_NUMBER_THRESHOLDS,
  Metric,
  ThresholdConfig,
} from '@red-hat-developer-hub/backstage-plugin-scorecard-common';
import {
  type ScorecardCollectorsService,
  MetricProvider,
} from '@red-hat-developer-hub/backstage-plugin-scorecard-node';
import {
  DORA_DEFAULT_DEPLOYMENTS_COLLECTOR_ID,
  DORA_DEFAULT_PULL_REQUESTS_COLLECTOR_ID,
  DORA_TIME_WINDOW_DAYS,
} from '../constants';
import {
  pullRequestsCollectorInputSchema,
  pullRequestsCollectorOutputSchema,
} from './schemas/pullRequestSchemas';
import {
  deploymentsCollectorInputSchema,
  deploymentsCollectorOutputSchema,
} from './schemas/deploymentSchemas';

type DoraLeadTimeForChangesProviderOptions = {
  collectorsService: ScorecardCollectorsService;
  deploymentsCollectorId: string;
  pullRequestsCollectorId: string;
  deploymentsCollectorInput: Record<string, unknown>;
  pullRequestsCollectorInput: Record<string, unknown>;
};

export class DoraLeadTimeForChangesProvider
  implements MetricProvider<'number'>
{
  private readonly collectorsService: ScorecardCollectorsService;
  private readonly deploymentsCollectorId: string;
  private readonly pullRequestsCollectorId: string;
  private readonly deploymentsCollectorInput: Record<string, unknown>;
  private readonly pullRequestsCollectorInput: Record<string, unknown>;

  private constructor(options: DoraLeadTimeForChangesProviderOptions) {
    this.collectorsService = options.collectorsService;
    this.deploymentsCollectorId = options.deploymentsCollectorId;
    this.pullRequestsCollectorId = options.pullRequestsCollectorId;
    this.deploymentsCollectorInput = options.deploymentsCollectorInput;
    this.pullRequestsCollectorInput = options.pullRequestsCollectorInput;
  }

  static fromConfig(
    config: Config,
    options: {
      collectorsService: ScorecardCollectorsService;
    },
  ): DoraLeadTimeForChangesProvider {
    return new DoraLeadTimeForChangesProvider({
      collectorsService: options.collectorsService,
      deploymentsCollectorId:
        config.getOptionalString(
          'scorecard.plugins.dora.lead_time_for_changes.collectors.deployments.id',
        ) ?? DORA_DEFAULT_DEPLOYMENTS_COLLECTOR_ID,
      pullRequestsCollectorId:
        config.getOptionalString(
          'scorecard.plugins.dora.lead_time_for_changes.collectors.pullRequests.id',
        ) ?? DORA_DEFAULT_PULL_REQUESTS_COLLECTOR_ID,
      deploymentsCollectorInput:
        config.getOptional<Record<string, unknown>>(
          'scorecard.plugins.dora.lead_time_for_changes.collectors.deployments.input',
        ) ?? {},
      pullRequestsCollectorInput:
        config.getOptional<Record<string, unknown>>(
          'scorecard.plugins.dora.lead_time_for_changes.collectors.pullRequests.input',
        ) ?? {},
    });
  }

  getProviderDatasourceId(): string {
    return 'dora';
  }

  getProviderId() {
    return 'dora.lead_time_for_changes';
  }

  getMetricType(): 'number' {
    return 'number';
  }

  getMetric(): Metric<'number'> {
    return {
      id: this.getProviderId(),
      title: 'DORA lead time for changes',
      description:
        'Average lead time in hours between merged PR and deployment for the configured datasource.',
      type: this.getMetricType(),
      history: true,
    };
  }

  getMetricThresholds(): ThresholdConfig {
    return DEFAULT_NUMBER_THRESHOLDS;
  }

  getCatalogFilter(): Record<string, string | symbol | (string | symbol)[]> {
    return {
      'metadata.annotations.scorecard.io/dora': 'true',
    };
  }

  async calculateMetric(entity: Entity): Promise<number> {
    const to = new Date();
    const from = new Date(to.getDate() - DORA_TIME_WINDOW_DAYS);

    const deploymentsCollected = await this.collectorsService.collect({
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
    const deployments = deploymentsCollected.deployments;

    if (deployments.length === 0) {
      return 0;
    }

    const leadTimeHours: number[] = [];
    for (const deployment of deployments) {
      const pullRequestsCollected = await this.collectorsService.collect({
        collectorId: this.pullRequestsCollectorId,
        contract: {
          inputSchema: pullRequestsCollectorInputSchema,
          outputSchema: pullRequestsCollectorOutputSchema,
        },
        entity,
        input: {
          ...this.pullRequestsCollectorInput,
          commitSha: deployment.commitSha,
        },
      });

      const mergedAt = pullRequestsCollected.pullRequests.find(
        pullRequest => pullRequest.mergedAt,
      )?.mergedAt;
      if (!mergedAt) {
        continue;
      }

      const mergedAtTimestamp = new Date(mergedAt).getTime();
      const deployedAtTimestamp = new Date(deployment.createdAt).getTime();
      if (
        Number.isNaN(mergedAtTimestamp) ||
        Number.isNaN(deployedAtTimestamp) ||
        deployedAtTimestamp < mergedAtTimestamp
      ) {
        continue;
      }

      leadTimeHours.push((deployedAtTimestamp - mergedAtTimestamp) / 3_600_000);
    }

    if (leadTimeHours.length === 0) {
      return 0;
    }

    const totalHours = leadTimeHours.reduce((sum, value) => sum + value, 0);
    return Number((totalHours / leadTimeHours.length).toFixed(4));
  }
}
