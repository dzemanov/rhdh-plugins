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
  DORA_TIME_WINDOW_DAYS,
} from '../constants';

type DoraDeploymentFrequencyProviderOptions = {
  collectorRegistry: CollectorRegistry;
  deploymentsCollectorId: string;
};

export class DoraDeploymentFrequencyProvider
  implements MetricProvider<'number'>
{
  private readonly collectorRegistry: CollectorRegistry;
  private readonly deploymentsCollectorId: string;

  private constructor(options: DoraDeploymentFrequencyProviderOptions) {
    this.collectorRegistry = options.collectorRegistry;
    this.deploymentsCollectorId = options.deploymentsCollectorId;
  }

  static fromConfig(
    config: Config,
    options: {
      collectorRegistry: CollectorRegistry;
    },
  ): DoraDeploymentFrequencyProvider {
    return new DoraDeploymentFrequencyProvider({
      collectorRegistry: options.collectorRegistry,
      deploymentsCollectorId:
        config.getOptionalString(
          'scorecard.plugins.dora.deployment_frequency.collectors.deployments.id',
        ) ?? DORA_DEFAULT_DEPLOYMENTS_COLLECTOR_ID,
    });
  }

  getProviderDatasourceId(): string {
    return 'dora';
  }

  getProviderId() {
    return 'dora.deployment_frequency';
  }

  getMetricType(): 'number' {
    return 'number';
  }

  getMetric(): Metric<'number'> {
    return {
      id: this.getProviderId(),
      title: 'DORA deployment frequency',
      description:
        'Successful deployments per day over the last 30 days for the configured datasource.',
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
        inputSchema: z.object({
          from: z.string().datetime(),
          to: z.string().datetime(),
        }),
        outputSchema: z.object({
          deployments: z.array(
            z.object({
              id: z.number(),
              sha: z.string(),
              createdAt: z.string(),
              status: z.string().optional(),
            }),
          ),
        }),
      },
      entity,
      input: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
    });

    const deployments = deploymentsCollected.deployments;

    if (deployments.length === 0) {
      return 0;
    }

    const successfulDeployments = deployments.filter(
      deployment =>
        !deployment.status || deployment.status.toLowerCase() === 'success',
    );

    return Number(
      (successfulDeployments.length / DORA_TIME_WINDOW_DAYS).toFixed(4),
    );
  }
}
