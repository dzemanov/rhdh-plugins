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
      { id: 0, sha: '', createdAt: '' },
      { id: 0, sha: '', createdAt: '', status: '' },
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
            id: z.number(),
            sha: z.string(),
            createdAt: z.string(),
            status: z.string().optional(),
          }),
        ),
      }),
    collect: jest.fn(async () => ({
      deployments,
    })),
  });

  it('uses configured deployments collector id and calculates frequency from successful deployments', async () => {
    const customCollectorId = 'custom:deployments';
    const deploymentsCollector = createDeploymentsCollector(customCollectorId, [
      {
        id: 100,
        sha: 'sha-1',
        createdAt: '2026-06-01T10:00:00.000Z',
        status: 'SUCCESS',
      },
      {
        id: 101,
        sha: 'sha-2',
        createdAt: '2026-06-02T10:00:00.000Z',
        status: 'success',
      },
      {
        id: 102,
        sha: 'sha-3',
        createdAt: '2026-06-03T10:00:00.000Z',
        status: 'failure',
      },
      {
        id: 103,
        sha: 'sha-4',
        createdAt: '2026-06-04T10:00:00.000Z',
      },
    ]);

    const getCollector = jest.fn(collectorId => {
      if (collectorId === customCollectorId) {
        return deploymentsCollector;
      }
      throw new Error(`Unexpected collector id "${collectorId}"`);
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
                  },
                },
              },
            },
          },
        },
      }),
      {
        collectorRegistry: {
          getCollector,
          hasCollector: () => true,
        },
      },
    );

    const frequency = await provider.calculateMetric(entity);

    expect(frequency).toBe(0.4286);
    expect(getCollector).toHaveBeenCalledWith(customCollectorId);
    expect(deploymentsCollector.collect).toHaveBeenCalledTimes(1);
  });

  it('uses default deployments collector id when config is not set', async () => {
    const defaultCollectorId = 'github:deployments';
    const deploymentsCollector = createDeploymentsCollector(
      defaultCollectorId,
      [
        {
          id: 200,
          sha: 'sha-default',
          createdAt: '2026-06-05T10:00:00.000Z',
          status: 'success',
        },
      ],
    );

    const getCollector = jest.fn(collectorId => {
      if (collectorId === defaultCollectorId) {
        return deploymentsCollector;
      }
      throw new Error(`Unexpected collector id "${collectorId}"`);
    });

    const provider = DoraDeploymentFrequencyProvider.fromConfig(
      new ConfigReader({}),
      {
        collectorRegistry: {
          getCollector,
          hasCollector: () => true,
        },
      },
    );

    const frequency = await provider.calculateMetric(entity);

    expect(frequency).toBe(0.1429);
    expect(getCollector).toHaveBeenCalledWith(defaultCollectorId);
  });

  it('returns 0 when no deployments are collected', async () => {
    const collectorId = 'github:deployments';
    const deploymentsCollector = createDeploymentsCollector(collectorId, []);

    const provider = DoraDeploymentFrequencyProvider.fromConfig(
      new ConfigReader({}),
      {
        collectorRegistry: {
          getCollector: () => deploymentsCollector,
          hasCollector: () => true,
        },
      },
    );

    const frequency = await provider.calculateMetric(entity);

    expect(frequency).toBe(0);
    expect(deploymentsCollector.collect).toHaveBeenCalledTimes(1);
  });
});
