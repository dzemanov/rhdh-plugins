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
  DORA_DEFAULT_INCIDENTS_COLLECTOR_ID,
  DORA_TIME_WINDOW_DAYS,
} from '../constants';
import {
  deploymentsCollectorInputSchema,
  deploymentsCollectorOutputSchema,
} from './schemas/deploymentSchemas';
import {
  incidentsCollectorInputSchema,
  incidentsCollectorOutputSchema,
} from './schemas/incidentSchemas';
import { DEFAULT_DORA_CHANGE_FAILURE_RATE_THRESHOLDS } from './DoraConfig';

type DoraChangeFailureRateProviderOptions = {
  collectorsService: ScorecardCollectorsService;
  deploymentsCollectorId: string;
  incidentsCollectorId: string;
  deploymentsCollectorInput: Record<string, unknown>;
  incidentsCollectorInput: Record<string, unknown>;
};

export class DoraChangeFailureRateProvider implements MetricProvider<'number'> {
  private readonly collectorsService: ScorecardCollectorsService;
  private readonly deploymentsCollectorId: string;
  private readonly incidentsCollectorId: string;
  private readonly deploymentsCollectorInput: Record<string, unknown>;
  private readonly incidentsCollectorInput: Record<string, unknown>;

  private constructor(options: DoraChangeFailureRateProviderOptions) {
    this.collectorsService = options.collectorsService;
    this.deploymentsCollectorId = options.deploymentsCollectorId;
    this.incidentsCollectorId = options.incidentsCollectorId;
    this.deploymentsCollectorInput = options.deploymentsCollectorInput;
    this.incidentsCollectorInput = options.incidentsCollectorInput;
  }

  static fromConfig(
    config: Config,
    options: {
      collectorsService: ScorecardCollectorsService;
    },
  ): DoraChangeFailureRateProvider {
    return new DoraChangeFailureRateProvider({
      collectorsService: options.collectorsService,
      deploymentsCollectorId:
        config.getOptionalString(
          'scorecard.plugins.dora.changeFailureRate.collectors.deployments.id',
        ) ?? DORA_DEFAULT_DEPLOYMENTS_COLLECTOR_ID,
      incidentsCollectorId:
        config.getOptionalString(
          'scorecard.plugins.dora.changeFailureRate.collectors.incidents.id',
        ) ?? DORA_DEFAULT_INCIDENTS_COLLECTOR_ID,
      deploymentsCollectorInput:
        config.getOptional<Record<string, unknown>>(
          'scorecard.plugins.dora.changeFailureRate.collectors.deployments.input',
        ) ?? {},
      incidentsCollectorInput:
        config.getOptional<Record<string, unknown>>(
          'scorecard.plugins.dora.changeFailureRate.collectors.incidents.input',
        ) ?? {},
    });
  }

  getProviderDatasourceId(): string {
    return 'dora';
  }

  getProviderId() {
    return 'dora.changeFailureRate';
  }

  getMetrics(): Metric<'number'>[] {
    return [
      {
        id: this.getProviderId(),
        title: 'DORA - Change Failure Rate',
        description:
          'Monitors the percentage of deployments that cause a failure in production over the past 30 days. Elite performers maintain a change failure rate below 5%.',
        type: 'number',
        thresholds: DEFAULT_DORA_CHANGE_FAILURE_RATE_THRESHOLDS,
        history: true,
      },
    ];
  }

  getCatalogFilter(): Record<string, string | symbol | (string | symbol)[]> {
    return {
      'metadata.annotations.scorecard.io/dora': 'true',
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

    const incidentsCollected = await this.collectorsService.collect<
      typeof incidentsCollectorInputSchema,
      typeof incidentsCollectorOutputSchema
    >({
      collectorId: this.incidentsCollectorId,
      contract: {
        inputSchema: incidentsCollectorInputSchema,
        outputSchema: incidentsCollectorOutputSchema,
      },
      entity,
      input: {
        ...this.incidentsCollectorInput,
        from: from.toISOString(),
        to: to.toISOString(),
      },
    });

    const successfulProductionDeployments =
      deploymentsCollected.deployments.filter(deployment => {
        if (deployment.result !== 'success') {
          return false;
        }
        if (
          deployment.environment &&
          deployment.environment.toLowerCase() !== 'production'
        ) {
          return false;
        }
        return true;
      });

    if (successfulProductionDeployments.length < 2) {
      results.set(this.getProviderId(), 0);
      return results;
    }

    let deploymentsWithIncidents = 0;
    let evaluatedDeployments = 0;
    for (
      let deploymentIndex = 0;
      deploymentIndex < successfulProductionDeployments.length - 1;
      deploymentIndex++
    ) {
      const deployment = successfulProductionDeployments[deploymentIndex];
      const nextDeployment =
        successfulProductionDeployments[deploymentIndex + 1];
      const deploymentCreatedAt = new Date(deployment.createdAt).getTime();
      const nextDeploymentCreatedAt = new Date(
        nextDeployment.createdAt,
      ).getTime();
      if (nextDeploymentCreatedAt <= deploymentCreatedAt) {
        continue;
      }

      evaluatedDeployments += 1;
      const hasIncident = incidentsCollected.incidents.some(incident => {
        const incidentCreatedAt = new Date(incident.createdAt).getTime();
        return (
          incidentCreatedAt >= deploymentCreatedAt &&
          incidentCreatedAt < nextDeploymentCreatedAt
        );
      });
      if (hasIncident) {
        deploymentsWithIncidents += 1;
      }
    }

    if (evaluatedDeployments === 0) {
      results.set(this.getProviderId(), 0);
      return results;
    }

    results.set(
      this.getProviderId(),
      Number(
        ((deploymentsWithIncidents / evaluatedDeployments) * 100).toFixed(4),
      ),
    );
    return results;
  }
}
