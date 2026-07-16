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
import { DoraChangeFailureRateProvider } from './DoraChangeFailureRateProvider';
import {
  buildMockCollectorsService,
  buildMockDeploymentsCollector,
  buildMockIncidentsCollector,
  mockEntity,
} from './__fixtures__';
import {
  DORA_DEFAULT_DEPLOYMENTS_COLLECTOR_ID,
  DORA_DEFAULT_INCIDENTS_COLLECTOR_ID,
} from '../constants';

describe('DoraChangeFailureRateProvider', () => {
  let deploymentsCollector: ReturnType<typeof buildMockDeploymentsCollector>;
  let incidentsCollector: ReturnType<typeof buildMockIncidentsCollector>;
  let collectorsService: ReturnType<
    typeof buildMockCollectorsService
  >['collectorsService'];
  let collect: ReturnType<typeof buildMockCollectorsService>['collect'];
  let provider: DoraChangeFailureRateProvider;

  beforeEach(() => {
    deploymentsCollector = buildMockDeploymentsCollector({
      deployments: [
        {
          id: '100',
          commitSha: 'sha-1',
          environment: 'production',
          createdAt: '2026-06-10T00:00:00.000Z',
          result: 'success',
        },
        {
          id: '101',
          commitSha: 'sha-2',
          environment: 'production',
          createdAt: '2026-06-11T00:00:00.000Z',
          result: 'success',
        },
      ],
      collectorId: DORA_DEFAULT_DEPLOYMENTS_COLLECTOR_ID,
    });
    incidentsCollector = buildMockIncidentsCollector({
      incidents: [
        {
          id: 'INC-1',
          createdAt: '2026-06-10T12:00:00.000Z',
          resolutionDate: '2026-06-10T13:00:00.000Z',
        },
      ],
      collectorId: DORA_DEFAULT_INCIDENTS_COLLECTOR_ID,
    });
    ({ collectorsService, collect } = buildMockCollectorsService({
      collectors: [deploymentsCollector, incidentsCollector],
    }));
    provider = DoraChangeFailureRateProvider.fromConfig(new ConfigReader({}), {
      collectorsService,
    });
  });

  it('should use default collectors when no config', async () => {
    await provider.calculateMetric(mockEntity);

    expect(collect).toHaveBeenCalledWith(
      expect.objectContaining({
        collectorId: DORA_DEFAULT_DEPLOYMENTS_COLLECTOR_ID,
      }),
    );
    expect(collect).toHaveBeenCalledWith(
      expect.objectContaining({
        collectorId: DORA_DEFAULT_INCIDENTS_COLLECTOR_ID,
      }),
    );
  });

  it('should use custom collectors and pass custom inputs', async () => {
    const customDeploymentsCollectorId = 'custom:deployments';
    const customIncidentsCollectorId = 'custom:incidents';
    const customDeploymentsCollector = buildMockDeploymentsCollector({
      deployments: [
        {
          id: '100',
          commitSha: 'sha-1',
          environment: 'production',
          createdAt: '2026-06-10T00:00:00.000Z',
          result: 'success',
        },
        {
          id: '101',
          commitSha: 'sha-2',
          environment: 'production',
          createdAt: '2026-06-11T00:00:00.000Z',
          result: 'success',
        },
      ],
      collectorId: customDeploymentsCollectorId,
    });
    const customIncidentsCollector = buildMockIncidentsCollector({
      incidents: [
        {
          id: 'INC-1',
          createdAt: '2026-06-10T12:00:00.000Z',
          resolutionDate: null,
        },
      ],
      collectorId: customIncidentsCollectorId,
    });
    const {
      collectorsService: customCollectorsService,
      collect: customCollect,
    } = buildMockCollectorsService({
      collectors: [customDeploymentsCollector, customIncidentsCollector],
    });
    const customProvider = DoraChangeFailureRateProvider.fromConfig(
      new ConfigReader({
        scorecard: {
          plugins: {
            dora: {
              change_failure_rate: {
                collectors: {
                  deployments: {
                    id: customDeploymentsCollectorId,
                    input: {
                      customDeploymentsInputLabel: 'deployments-custom-input',
                    },
                  },
                  incidents: {
                    id: customIncidentsCollectorId,
                    input: {
                      customIncidentsInputLabel: 'incidents-custom-input',
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
        collectorId: customDeploymentsCollectorId,
        input: expect.objectContaining({
          from: expect.any(String),
          to: expect.any(String),
          customDeploymentsInputLabel: 'deployments-custom-input',
        }),
      }),
    );
    expect(customCollect).toHaveBeenCalledWith(
      expect.objectContaining({
        collectorId: customIncidentsCollectorId,
        input: expect.objectContaining({
          from: expect.any(String),
          to: expect.any(String),
          customIncidentsInputLabel: 'incidents-custom-input',
        }),
      }),
    );
  });

  it('should calculate change failure rate using incidents between successful deployments', async () => {
    jest.mocked(deploymentsCollector.collect).mockResolvedValueOnce({
      deployments: [
        {
          id: '100',
          commitSha: 'sha-1',
          environment: 'production',
          createdAt: '2026-06-10T00:00:00.000Z',
          result: 'success',
        },
        {
          id: '101',
          commitSha: 'sha-2',
          environment: 'production',
          createdAt: '2026-06-11T00:00:00.000Z',
          result: 'success',
        },
        {
          id: '102',
          commitSha: 'sha-3',
          environment: 'production',
          createdAt: '2026-06-12T00:00:00.000Z',
          result: 'success',
        },
      ],
    });
    jest.mocked(incidentsCollector.collect).mockResolvedValueOnce({
      incidents: [
        {
          id: 'INC-1',
          createdAt: '2026-06-10T06:00:00.000Z', // for deployment 100
          resolutionDate: null,
        },
        {
          id: 'INC-2',
          createdAt: '2026-06-12T05:00:00.000Z', // after last pair boundary
          resolutionDate: null,
        },
      ],
    });

    const cfr = await provider.calculateMetric(mockEntity);

    expect(cfr).toBe(50); // 1 failed pair out of 2 pairs
  });

  it('should return 0 when there are fewer than two successful production deployments', async () => {
    jest.mocked(deploymentsCollector.collect).mockResolvedValueOnce({
      deployments: [
        {
          id: '100',
          commitSha: 'sha-1',
          environment: 'production',
          createdAt: '2026-06-10T00:00:00.000Z',
          result: 'success',
        },
      ],
    });

    const cfr = await provider.calculateMetric(mockEntity);

    expect(cfr).toBe(0);
  });
});
