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

  getMetricType(): 'number' {
    return 'number';
  }

  getMetric(): Metric<'number'> {
    return {
      id: this.getProviderId(),
      title: 'DORA - Median Lead Time for Changes',
      description:
        'Measures the median time from merge commit to production deployment over the past 30 days. Elite performers have a lead time of less than one hour',
      type: this.getMetricType(),
      history: true,
    };
  }

  getMetricThresholds(): ThresholdConfig {
    // Calculated metric is in hours from a 30-day window
    return {
      rules: [
        {
          key: 'elite',
          expression: '<24',
          color: ScorecardThresholdRuleColors.SUCCESS,
          icon: 'scorecardSuccessStatusIcon',
        },
        {
          key: 'medium',
          expression: '24-168',
          color: ScorecardThresholdRuleColors.WARNING,
          icon: 'scorecardWarningStatusIcon',
        },
        {
          key: 'low',
          expression: '>168',
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
      return 0;
    }

    const leadTimeHours: number[] = [];
    for (
      let deploymentIndex = 1;
      deploymentIndex < deployments.length;
      deploymentIndex++
    ) {
      const previousDeployment = deployments[deploymentIndex - 1];
      const deployment = deployments[deploymentIndex];

      const pullRequestsCollected = await this.collectorsService.collect({
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
      return 0;
    }

    const median = calculateMedian(leadTimeHours);
    return Number(median.toFixed(4));
  }
}
