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
  DORA_DEFAULT_INCIDENTS_COLLECTOR_ID,
  DORA_TIME_WINDOW_DAYS,
} from '../constants';
import {
  incidentsCollectorInputSchema,
  incidentsCollectorOutputSchema,
} from './schemas/incidentSchemas';
import { calculateMean } from './utils/calculationUtils';
import { DEFAULT_DORA_MEAN_TIME_TO_RESTORE_THRESHOLDS } from './DoraConfig';

type DoraMeanTimeToRestoreProviderOptions = {
  collectorsService: ScorecardCollectorsService;
  incidentsCollectorId: string;
  incidentsCollectorInput: Record<string, unknown>;
};

export class DoraMeanTimeToRestoreProvider implements MetricProvider<'number'> {
  private readonly collectorsService: ScorecardCollectorsService;
  private readonly incidentsCollectorId: string;
  private readonly incidentsCollectorInput: Record<string, unknown>;

  private constructor(options: DoraMeanTimeToRestoreProviderOptions) {
    this.collectorsService = options.collectorsService;
    this.incidentsCollectorId = options.incidentsCollectorId;
    this.incidentsCollectorInput = options.incidentsCollectorInput;
  }

  static fromConfig(
    config: Config,
    options: {
      collectorsService: ScorecardCollectorsService;
    },
  ): DoraMeanTimeToRestoreProvider {
    return new DoraMeanTimeToRestoreProvider({
      collectorsService: options.collectorsService,
      incidentsCollectorId:
        config.getOptionalString(
          'scorecard.plugins.dora.meanTimeToRestore.collectors.incidents.id',
        ) ?? DORA_DEFAULT_INCIDENTS_COLLECTOR_ID,
      incidentsCollectorInput:
        config.getOptional<Record<string, unknown>>(
          'scorecard.plugins.dora.meanTimeToRestore.collectors.incidents.input',
        ) ?? {},
    });
  }

  getProviderDatasourceId(): string {
    return 'dora';
  }

  getProviderId() {
    return 'dora.meanTimeToRestore';
  }

  getMetrics(): Metric<'number'>[] {
    return [
      {
        id: this.getProviderId(),
        title: 'DORA - Mean Time to Restore',
        description:
          'Tracks the average time to restore service after an incident over the past 30 days. Elite performers restore service in under one hour.',
        type: 'number',
        thresholds: DEFAULT_DORA_MEAN_TIME_TO_RESTORE_THRESHOLDS,
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

    const recoveryHours: number[] = [];
    for (const incident of incidentsCollected.incidents) {
      if (!incident.resolutionAt) {
        continue;
      }
      const createdAtTimestamp = new Date(incident.createdAt).getTime();
      const resolutionAtTimestamp = new Date(incident.resolutionAt).getTime();
      if (resolutionAtTimestamp < createdAtTimestamp) {
        continue;
      }
      recoveryHours.push(
        (resolutionAtTimestamp - createdAtTimestamp) / 3_600_000,
      );
    }

    if (recoveryHours.length === 0) {
      results.set(this.getProviderId(), 0);
      return results;
    }

    results.set(
      this.getProviderId(),
      Number(calculateMean(recoveryHours).toFixed(4)),
    );
    return results;
  }
}
