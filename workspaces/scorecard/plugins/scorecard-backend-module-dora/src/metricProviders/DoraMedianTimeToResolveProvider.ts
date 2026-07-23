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
  Metric,
  ScorecardThresholdRuleColors,
  ThresholdConfig,
} from '@red-hat-developer-hub/backstage-plugin-scorecard-common';
import {
  type ScorecardCollectorsService,
  MetricProvider,
} from '@red-hat-developer-hub/backstage-plugin-scorecard-node';
import {
  DORA_DEFAULT_INCIDENTS_COLLECTOR_ID,
  DORA_TIME_WINDOW_DAYS,
} from '../constants';
import {
  incidentsCollectorInputSchema,
  incidentsCollectorOutputSchema,
} from './schemas/incidentSchemas';
import { calculateMedian } from './utils/calculationUtils';

type DoraMedianTimeToResolveProviderOptions = {
  collectorsService: ScorecardCollectorsService;
  incidentsCollectorId: string;
  incidentsCollectorInput: Record<string, unknown>;
};

export class DoraMedianTimeToResolveProvider
  implements MetricProvider<'number'>
{
  private readonly collectorsService: ScorecardCollectorsService;
  private readonly incidentsCollectorId: string;
  private readonly incidentsCollectorInput: Record<string, unknown>;

  private constructor(options: DoraMedianTimeToResolveProviderOptions) {
    this.collectorsService = options.collectorsService;
    this.incidentsCollectorId = options.incidentsCollectorId;
    this.incidentsCollectorInput = options.incidentsCollectorInput;
  }

  static fromConfig(
    config: Config,
    options: {
      collectorsService: ScorecardCollectorsService;
    },
  ): DoraMedianTimeToResolveProvider {
    return new DoraMedianTimeToResolveProvider({
      collectorsService: options.collectorsService,
      incidentsCollectorId:
        config.getOptionalString(
          'scorecard.plugins.dora.medianTimeToResolve.collectors.incidents.id',
        ) ?? DORA_DEFAULT_INCIDENTS_COLLECTOR_ID,
      incidentsCollectorInput:
        config.getOptional<Record<string, unknown>>(
          'scorecard.plugins.dora.medianTimeToResolve.collectors.incidents.input',
        ) ?? {},
    });
  }

  getProviderDatasourceId(): string {
    return 'dora';
  }

  getProviderId() {
    return 'dora.medianTimeToResolve';
  }

  getMetricType(): 'number' {
    return 'number';
  }

  getMetric(): Metric<'number'> {
    return {
      id: this.getProviderId(),
      title: 'DORA - Median Time to Resolve',
      description:
        'Measures the median time to resolve incidents over the past 30 days.',
      type: this.getMetricType(),
      history: true,
    };
  }

  getMetricThresholds(): ThresholdConfig {
    // in hours
    return {
      rules: [
        {
          key: 'elite',
          expression: '<1',
          color: ScorecardThresholdRuleColors.SUCCESS,
          icon: 'scorecardSuccessStatusIcon',
        },
        {
          key: 'medium',
          expression: '1-24',
          color: ScorecardThresholdRuleColors.WARNING,
          icon: 'scorecardWarningStatusIcon',
        },
        {
          key: 'low',
          expression: '>24',
          color: ScorecardThresholdRuleColors.ERROR,
          icon: 'scorecardErrorStatusIcon',
        },
      ],
    };
  }

  getCatalogFilter(): Record<string, string | symbol | (string | symbol)[]> {
    return {
      'metadata.annotations.scorecard.io/dora': 'true',
    };
  }

  async calculateMetric(entity: Entity): Promise<number> {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - DORA_TIME_WINDOW_DAYS);

    const incidentsCollected = await this.collectorsService.collect({
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

    const recoveryHours: number[] = [];
    for (const incident of incidentsCollected.incidents) {
      if (!incident.resolutionAt) {
        continue;
      }
      const createdAtTimestamp = new Date(incident.createdAt).getTime();
      const resolutionAtTimestamp = new Date(incident.resolutionAt).getTime();
      if (
        Number.isNaN(createdAtTimestamp) ||
        Number.isNaN(resolutionAtTimestamp) ||
        resolutionAtTimestamp < createdAtTimestamp
      ) {
        continue;
      }
      recoveryHours.push(
        (resolutionAtTimestamp - createdAtTimestamp) / 3_600_000,
      );
    }

    if (recoveryHours.length === 0) {
      return 0;
    }

    return Number(calculateMedian(recoveryHours).toFixed(4));
  }
}
