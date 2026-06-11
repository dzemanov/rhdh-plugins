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

import { ConfigReader } from '@backstage/config';
import { GithubOpenPRsProvider } from './GithubOpenPRsProvider';
import { GithubEntityClient } from '../github/GithubEntityClient';
import { DEFAULT_NUMBER_THRESHOLDS } from '@red-hat-developer-hub/backstage-plugin-scorecard-common';

jest.mock('../github/GithubEntityClient');

describe('GithubOpenPRsProvider', () => {
  describe('fromConfig', () => {
    it('should create provider with default thresholds', () => {
      const provider = GithubOpenPRsProvider.fromConfig(new ConfigReader({}));

      expect(provider.getMetricThresholds()).toEqual(DEFAULT_NUMBER_THRESHOLDS);
    });
  });

  describe('calculateMetric', () => {
    let provider;
    const mockedGithubEntityClient = GithubEntityClient;
    const mockedGithubEntityClientInstance = {
      getOpenPullRequestsCount: jest.fn(),
    };
    mockedGithubEntityClient.mockImplementation(
      () => mockedGithubEntityClientInstance,
    );

    beforeEach(() => {
      jest.clearAllMocks();
      provider = GithubOpenPRsProvider.fromConfig(new ConfigReader({}));
    });

    it('should calculate metric', async () => {
      mockedGithubEntityClientInstance.getOpenPullRequestsCount.mockResolvedValue(
        42,
      );
      const mockEntity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'test-component',
          annotations: {
            'github.com/project-slug': 'org/orgRepo',
          },
        },
      };

      const result = await provider.calculateMetric(mockEntity);

      expect(result).toBe(42);
      expect(
        mockedGithubEntityClientInstance.getOpenPullRequestsCount,
      ).toHaveBeenCalledWith(mockEntity);
    });
  });
});
