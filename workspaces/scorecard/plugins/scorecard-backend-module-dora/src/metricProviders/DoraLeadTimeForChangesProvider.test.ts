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
import {
  Collector,
  ScorecardCollectorsService,
} from '@red-hat-developer-hub/backstage-plugin-scorecard-node';
import { z } from 'zod';
import { DoraLeadTimeForChangesProvider } from './DoraLeadTimeForChangesProvider';

describe('DoraLeadTimeForChangesProvider', () => {
  it('should calculate average lead time from deployments and pull requests collectors', async () => {
    const deploymentsCollector: Collector = {
      getCollectorId: () => 'github:deployments',
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
      collect: jest.fn(async () => ({
        deployments: [
          {
            id: '100',
            commitSha: 'sha-one',
            environment: 'production',
            createdAt: '2026-06-06T12:00:00.000Z',
            result: 'success',
          },
        ],
      })),
    };
    const pullRequestsCollector: Collector = {
      getCollectorId: () => 'github:deployment-pull-requests',
      getCollectorDescription: () => 'mock pull requests collector',
      getInputSchema: () =>
        z.object({
          commitSha: z.string().min(1),
        }),
      getOutputSchema: () =>
        z.object({
          pullRequests: z.array(
            z.object({
              id: z.string(),
              mergedAt: z.string().nullable(),
            }),
          ),
        }),
      collect: jest.fn(async () => ({
        pullRequests: [
          {
            id: '123',
            mergedAt: '2026-06-05T12:00:00.000Z',
          },
        ],
      })),
    };

    const collectorsService = {
      init: () => undefined,
      hasCollector: () => true,
      collect: async ({ collectorId, entity: collectEntity, input }) => {
        if (collectorId === 'github:deployments') {
          return deploymentsCollector.collect({
            entity: collectEntity,
            input: input as { from: string; to: string },
          });
        }
        if (collectorId === 'github:deployment-pull-requests') {
          return pullRequestsCollector.collect({
            entity: collectEntity,
            input: input as { commitSha: string },
          });
        }
        throw new Error(`Unexpected collector id "${collectorId}"`);
      },
    } as ScorecardCollectorsService;

    const provider = DoraLeadTimeForChangesProvider.fromConfig(
      new ConfigReader({
        scorecard: {
          plugins: {
            dora: {
              lead_time_for_changes: {
                collectors: {
                  deployments: {
                    input: {
                      workflowName: 'Deploy',
                    },
                  },
                  pullRequests: {
                    input: {
                      mergeStrategy: 'squash',
                    },
                  },
                },
              },
            },
          },
        },
      }),
      {
        collectorsService,
      },
    );

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

    const leadTime = await provider.calculateMetric(entity);

    expect(leadTime).toBe(24);
    expect(deploymentsCollector.collect).toHaveBeenCalledTimes(1);
    expect(pullRequestsCollector.collect).toHaveBeenCalledTimes(1);
    expect(deploymentsCollector.collect).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          from: expect.any(String),
          to: expect.any(String),
        }),
      }),
    );
    expect(pullRequestsCollector.collect).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          commitSha: 'sha-one',
        }),
      }),
    );
  });
});
