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
import { DoraDeploymentFrequencyProvider } from './DoraDeploymentFrequencyProvider';
import {
  buildMockCollectorsService,
  buildMockDeploymentsCollector,
  mockEntity,
} from './__fixtures__';
import { DORA_DEFAULT_DEPLOYMENTS_COLLECTOR_ID } from '../constants';

describe('DoraDeploymentFrequencyProvider', () => {
  let deploymentsCollector: ReturnType<typeof buildMockDeploymentsCollector>;
  let collectorsService: ReturnType<
    typeof buildMockCollectorsService
  >['collectorsService'];
  let collect: ReturnType<typeof buildMockCollectorsService>['collect'];
  let provider: DoraDeploymentFrequencyProvider;

  beforeEach(() => {
    deploymentsCollector = buildMockDeploymentsCollector({
      deployments: [],
      collectorId: DORA_DEFAULT_DEPLOYMENTS_COLLECTOR_ID,
    });
    ({ collectorsService, collect } = buildMockCollectorsService({
      collectors: [deploymentsCollector],
    }));
    provider = DoraDeploymentFrequencyProvider.fromConfig(
      new ConfigReader({}),
      {
        collectorsService,
      },
    );
  });

  it('should use default collectors when no config', async () => {
    await provider.calculateMetric(mockEntity);
    expect(collect).toHaveBeenCalledWith(
      expect.objectContaining({
        collectorId: DORA_DEFAULT_DEPLOYMENTS_COLLECTOR_ID,
        input: expect.objectContaining({
          from: expect.any(String),
          to: expect.any(String),
        }),
      }),
    );
  });

  it('should use custom collectors and pass custom inputs', async () => {
    const customCollectorId = 'custom:deployments';
    const customDeploymentsCollector = buildMockDeploymentsCollector({
      deployments: [],
      collectorId: customCollectorId,
    });
    const {
      collectorsService: customCollectorsService,
      collect: customCollect,
    } = buildMockCollectorsService({
      collectors: [customDeploymentsCollector],
    });

    const customProvider = DoraDeploymentFrequencyProvider.fromConfig(
      new ConfigReader({
        scorecard: {
          plugins: {
            dora: {
              deployment_frequency: {
                collectors: {
                  deployments: {
                    id: customCollectorId,
                    input: {
                      artificialLabel: 'frequency-test',
                    },
                  },
                },
              },
            },
          },
        },
      }),
      {
        collectorsService: customCollectorsService,
      },
    );

    await customProvider.calculateMetric(mockEntity);

    expect(customCollect).toHaveBeenCalledWith(
      expect.objectContaining({
        collectorId: customCollectorId,
        input: expect.objectContaining({
          from: expect.any(String),
          to: expect.any(String),
          artificialLabel: 'frequency-test',
        }),
      }),
    );
  });

  it('should calculate frequency for success result and production environment', async () => {
    (deploymentsCollector.collect as jest.Mock).mockResolvedValueOnce({
      deployments: [
        {
          id: '100',
          commitSha: 'sha-1',
          environment: 'production',
          createdAt: '2026-06-01T10:00:00.000Z',
          result: 'success',
        },
        {
          id: '101',
          commitSha: 'sha-2',
          environment: 'production',
          createdAt: '2026-06-02T10:00:00.000Z',
          result: 'failure', // omitted
        },
        {
          id: '102',
          commitSha: 'sha-3',
          environment: 'production',
          createdAt: '2026-06-03T10:00:00.000Z',
          result: '', // omitted
        },
        {
          id: '103',
          commitSha: 'sha-2',
          createdAt: '2026-06-04T10:00:00.000Z',
          result: 'success',
        },
        {
          id: '104',
          commitSha: 'sha-4',
          environment: 'development', // omitted
          createdAt: '2026-06-04T11:00:00.000Z',
          result: 'success',
        },
      ],
    });

    const frequency = await provider.calculateMetric(mockEntity);

    expect(frequency).toBe(0.4667); // (2 successful deployments / 30 days) * 7
  });

  it('returns 0 when no deployments are collected', async () => {
    (deploymentsCollector.collect as jest.Mock).mockResolvedValueOnce({
      deployments: [],
    });

    const frequency = await provider.calculateMetric(mockEntity);

    expect(frequency).toBe(0);
  });
});
