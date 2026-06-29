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
import { z } from 'zod';
import { DoraDeploymentFrequencyProvider } from './DoraDeploymentFrequencyProvider';
import { ScorecardCollectorsService } from '@red-hat-developer-hub/backstage-plugin-scorecard-node';

describe('DoraDeploymentFrequencyProvider', () => {
  const entity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: 'test-component',
      annotations: {
        'github.com/project-slug': 'org/repo',
      },
    },
  };

  const createDeploymentsCollector = (
    collectorId = '',
    deployments = [
      {
        id: '0',
        commitSha: '',
        environment: 'unknown',
        createdAt: '',
        result: '',
      },
      {
        id: '1',
        commitSha: '',
        environment: 'unknown',
        createdAt: '',
        result: '',
      },
    ],
  ) => ({
    getCollectorId: () => collectorId,
    getCollectorDescription: () => 'mock deployments collector',
    getInputSchema: () =>
      z.object({
        from: z.string().datetime(),
        to: z.string().datetime(),
      }),
    getOutputSchema: () =>
      z.object({
        deployments: z.array(
          z.object({
            id: z.string(),
            commitSha: z.string(),
            environment: z.string(),
            createdAt: z.string(),
            result: z.enum(['success', 'failure', '']),
          }),
        ),
      }),
    collect: jest.fn(async (_options: unknown) => ({
      deployments,
    })),
  });

  it('uses configured deployments collector id and calculates frequency from successful deployments', async () => {
    const customCollectorId = 'custom:deployments';
    const deploymentsCollector = createDeploymentsCollector(customCollectorId, [
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
        result: 'success',
      },
      {
        id: '102',
        commitSha: 'sha-3',
        environment: 'production',
        createdAt: '2026-06-03T10:00:00.000Z',
        result: 'failure',
      },
      {
        id: '103',
        commitSha: 'sha-4',
        environment: 'production',
        createdAt: '2026-06-04T10:00:00.000Z',
        result: '',
      },
    ]);

    const collect = jest.fn(async ({ collectorId }) => {
      if (collectorId !== customCollectorId) {
        throw new Error(`Unexpected collector id "${collectorId}"`);
      }
      return deploymentsCollector.collect({
        entity,
        input: {
          from: new Date().toISOString(),
          to: new Date().toISOString(),
        },
      });
    });

    const provider = DoraDeploymentFrequencyProvider.fromConfig(
      new ConfigReader({
        scorecard: {
          plugins: {
            dora: {
              deployment_frequency: {
                collectors: {
                  deployments: {
                    id: customCollectorId,
                    input: {
                      workflowName: 'Deploy',
                    },
                  },
                },
              },
            },
          },
        },
      }),
      {
        collectorsService: {
          registerCollector: () => undefined,
          hasCollector: () => true,
          collect,
        } as ScorecardCollectorsService,
      },
    );

    const frequency = await provider.calculateMetric(entity);

    expect(frequency).toBe(0.2857);
    expect(collect).toHaveBeenCalledWith(
      expect.objectContaining({
        collectorId: customCollectorId,
      }),
    );
    expect(deploymentsCollector.collect).toHaveBeenCalledTimes(1);
    expect(deploymentsCollector.collect).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          from: expect.any(String),
          to: expect.any(String),
        }),
      }),
    );
  });

  it('uses default deployments collector id when config is not set', async () => {
    const defaultCollectorId = 'github:deployments';
    const deploymentsCollector = createDeploymentsCollector(
      defaultCollectorId,
      [
        {
          id: '200',
          commitSha: 'sha-default',
          environment: 'production',
          createdAt: '2026-06-05T10:00:00.000Z',
          result: 'success',
        },
      ],
    );

    const collect = jest.fn(async ({ collectorId }) => {
      if (collectorId !== defaultCollectorId) {
        throw new Error(`Unexpected collector id "${collectorId}"`);
      }
      return deploymentsCollector.collect({
        entity,
        input: {
          from: new Date().toISOString(),
          to: new Date().toISOString(),
        },
      });
    });

    const provider = DoraDeploymentFrequencyProvider.fromConfig(
      new ConfigReader({}),
      {
        collectorsService: {
          registerCollector: () => undefined,
          hasCollector: () => true,
          collect,
        } as ScorecardCollectorsService,
      },
    );

    const frequency = await provider.calculateMetric(entity);

    expect(frequency).toBe(0.1429);
    expect(collect).toHaveBeenCalledWith(
      expect.objectContaining({
        collectorId: defaultCollectorId,
      }),
    );
  });

  it('returns 0 when no deployments are collected', async () => {
    const collectorId = 'github:deployments';
    const deploymentsCollector = createDeploymentsCollector(collectorId, []);

    const provider = DoraDeploymentFrequencyProvider.fromConfig(
      new ConfigReader({}),
      {
        collectorsService: {
          registerCollector: () => undefined,
          hasCollector: () => true,
          collect: async () =>
            deploymentsCollector.collect({
              entity,
              input: {
                from: new Date().toISOString(),
                to: new Date().toISOString(),
              },
            }),
        } as ScorecardCollectorsService,
      },
    );

    const frequency = await provider.calculateMetric(entity);

    expect(frequency).toBe(0);
    expect(deploymentsCollector.collect).toHaveBeenCalledTimes(1);
  });
});
