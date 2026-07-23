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
import { DoraMeanTimeToRestoreProvider } from './DoraMeanTimeToRestoreProvider';
import {
  buildMockCollectorsService,
  buildMockIncidentsCollector,
  mockEntity,
} from './__fixtures__';
import { DORA_DEFAULT_INCIDENTS_COLLECTOR_ID } from '../constants';

describe('DoraMeanTimeToRestoreProvider', () => {
  let incidentsCollector: ReturnType<typeof buildMockIncidentsCollector>;
  let collectorsService: ReturnType<
    typeof buildMockCollectorsService
  >['collectorsService'];
  let collect: ReturnType<typeof buildMockCollectorsService>['collect'];
  let provider: DoraMeanTimeToRestoreProvider;

  beforeEach(() => {
    incidentsCollector = buildMockIncidentsCollector({
      incidents: [
        {
          id: 'INC-1',
          createdAt: '2026-06-10T10:00:00.000Z',
          resolutionAt: '2026-06-10T12:00:00.000Z',
        },
      ],
      collectorId: DORA_DEFAULT_INCIDENTS_COLLECTOR_ID,
    });
    ({ collectorsService, collect } = buildMockCollectorsService({
      collectors: [incidentsCollector],
    }));
    provider = DoraMeanTimeToRestoreProvider.fromConfig(new ConfigReader({}), {
      collectorsService,
    });
  });

  it('should use default collector when no config', async () => {
    await provider.calculateMetric(mockEntity);

    expect(collect).toHaveBeenCalledWith(
      expect.objectContaining({
        collectorId: DORA_DEFAULT_INCIDENTS_COLLECTOR_ID,
        input: expect.objectContaining({
          from: expect.any(String),
          to: expect.any(String),
        }),
      }),
    );
  });

  it('should use custom collector and pass custom inputs', async () => {
    const customIncidentsCollectorId = 'custom:incidents';
    const customIncidentsCollector = buildMockIncidentsCollector({
      incidents: [
        {
          id: 'INC-2',
          createdAt: '2026-06-10T10:00:00.000Z',
          resolutionAt: '2026-06-10T12:00:00.000Z',
        },
      ],
      collectorId: customIncidentsCollectorId,
    });
    const {
      collectorsService: customCollectorsService,
      collect: customCollect,
    } = buildMockCollectorsService({
      collectors: [customIncidentsCollector],
    });
    const customProvider = DoraMeanTimeToRestoreProvider.fromConfig(
      new ConfigReader({
        scorecard: {
          plugins: {
            dora: {
              meanTimeToRestore: {
                collectors: {
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
        collectorId: customIncidentsCollectorId,
        input: expect.objectContaining({
          from: expect.any(String),
          to: expect.any(String),
          customIncidentsInputLabel: 'incidents-custom-input',
        }),
      }),
    );
  });

  it('should calculate mean time to restore in hours', async () => {
    jest.mocked(incidentsCollector.collect).mockResolvedValueOnce({
      incidents: [
        {
          id: 'INC-1',
          createdAt: '2026-06-10T10:00:00.000Z',
          resolutionAt: '2026-06-10T11:00:00.000Z', // 1h
        },
        {
          id: 'INC-2',
          createdAt: '2026-06-11T10:00:00.000Z',
          resolutionAt: '2026-06-11T12:00:00.000Z', // 2h
        },
        {
          id: 'INC-3',
          createdAt: '2026-06-12T10:00:00.000Z',
          resolutionAt: '2026-06-12T16:00:00.000Z', // 6h
        },
      ],
    });

    const mttr = await provider.calculateMetric(mockEntity);

    expect(mttr).toBe(3);
  });

  it('should return 0 when no resolved incidents are found', async () => {
    jest.mocked(incidentsCollector.collect).mockResolvedValueOnce({
      incidents: [
        {
          id: 'INC-1',
          createdAt: '2026-06-10T10:00:00.000Z',
          resolutionAt: null,
        },
      ],
    });

    const mttr = await provider.calculateMetric(mockEntity);

    expect(mttr).toBe(0);
  });
});
