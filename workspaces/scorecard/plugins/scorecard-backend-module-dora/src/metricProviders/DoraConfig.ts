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

import {
  ScorecardThresholdRuleColors,
  ThresholdConfig,
} from '@red-hat-developer-hub/backstage-plugin-scorecard-common';

export const DEFAULT_DORA_DEPLOYMENT_FREQUENCY_THRESHOLDS: ThresholdConfig =
  // Calculated metric is deployments/week from a 30-day window
  {
    rules: [
      {
        key: 'elite',
        expression: '>=7',
        color: ScorecardThresholdRuleColors.SUCCESS,
        icon: 'scorecardSuccessStatusIcon',
      },
      {
        key: 'medium',
        expression: '1-7',
        color: ScorecardThresholdRuleColors.WARNING,
        icon: 'scorecardWarningStatusIcon',
      },
      {
        key: 'low',
        expression: '<1',
        color: ScorecardThresholdRuleColors.ERROR,
        icon: 'scorecardErrorStatusIcon',
      },
    ],
  };

export const DEFAULT_DORA_MEDIAN_LEAD_TIME_THRESHOLDS: ThresholdConfig =
  // Calculated metric is in hours from a 30-day window
  {
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
