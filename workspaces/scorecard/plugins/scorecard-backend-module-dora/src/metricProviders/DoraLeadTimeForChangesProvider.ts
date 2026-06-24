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
  collectWithContract,
  type CollectorRegistry,
  MetricProvider,
} from '@red-hat-developer-hub/backstage-plugin-scorecard-node';
import { z } from 'zod';
import {
  DORA_DEFAULT_DEPLOYMENTS_COLLECTOR_ID,
  DORA_DEFAULT_COMMIT_CHANGE_REQUESTS_COLLECTOR_ID,
  DORA_TIME_WINDOW_DAYS,
} from '../constants';

const leadTimeCollectorInputSchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
});

const leadTimeCollectorOutputSchema = z.object({
  deployments: z.array(
    z.object({
      id: z.number(),
      sha: z.string(),
      createdAt: z.string(),
    }),
  ),
});

const pullRequestsCollectorInputSchema = z.object({
  sha: z.string().min(1),
});

const pullRequestsCollectorOutputSchema = z.object({
  pullRequests: z.array(
    z.object({
      number: z.number(),
      mergedAt: z.string().nullable(),
    }),
  ),
});

type DoraLeadTimeForChangesProviderOptions = {
  collectorRegistry: CollectorRegistry;
  deploymentsCollectorId: string;
  pullRequestsCollectorId: string;
};

export class DoraLeadTimeForChangesProvider
  implements MetricProvider<'number'>
{
  private readonly collectorRegistry: CollectorRegistry;
  private readonly deploymentsCollectorId: string;
  private readonly pullRequestsCollectorId: string;

  private constructor(options: DoraLeadTimeForChangesProviderOptions) {
    this.collectorRegistry = options.collectorRegistry;
    this.deploymentsCollectorId = options.deploymentsCollectorId;
    this.pullRequestsCollectorId = options.pullRequestsCollectorId;
  }

  static fromConfig(
    config: Config,
    options: {
      collectorRegistry: CollectorRegistry;
    },
  ): DoraLeadTimeForChangesProvider {
    return new DoraLeadTimeForChangesProvider({
      collectorRegistry: options.collectorRegistry,
      deploymentsCollectorId:
        config.getOptionalString(
          'scorecard.plugins.dora.lead_time_for_changes.collectors.deployments.id',
        ) ?? DORA_DEFAULT_DEPLOYMENTS_COLLECTOR_ID,
      pullRequestsCollectorId:
        config.getOptionalString(
          'scorecard.plugins.dora.lead_time_for_changes.collectors.commitChangeRequests.id',
        ) ?? DORA_DEFAULT_COMMIT_CHANGE_REQUESTS_COLLECTOR_ID,
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

    const deploymentsCollected = await collectWithContract({
      collectorRegistry: this.collectorRegistry,
      collectorId: this.deploymentsCollectorId,
      contract: {
        inputSchema: leadTimeCollectorInputSchema,
        outputSchema: leadTimeCollectorOutputSchema,
      },
      entity,
      input: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
    });

    if (deploymentsCollected.deployments.length === 0) {
      return 0;
    }

    const leadTimeHours: number[] = [];
    for (const deployment of deploymentsCollected.deployments) {
      const pullRequestsCollected = await collectWithContract({
        collectorRegistry: this.collectorRegistry,
        collectorId: this.pullRequestsCollectorId,
        contract: {
          inputSchema: pullRequestsCollectorInputSchema,
          outputSchema: pullRequestsCollectorOutputSchema,
        },
        entity,
        input: {
          sha: deployment.sha,
        },
      });

      const mergedAt = pullRequestsCollected.pullRequests.find(
        pr => pr.mergedAt,
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
