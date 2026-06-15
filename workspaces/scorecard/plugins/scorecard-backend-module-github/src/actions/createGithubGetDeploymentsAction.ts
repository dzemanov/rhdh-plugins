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
import { ActionsRegistryService } from '@backstage/backend-plugin-api/alpha';
import type { Entity } from '@backstage/catalog-model';
import { GithubEntityClient } from '../github/GithubEntityClient';

const MAX_DEPLOYMENTS_WINDOW_MS = 180 * 24 * 60 * 60 * 1000;

export const createGithubGetDeploymentsAction = (options: {
  actionsRegistry: ActionsRegistryService;
  githubEntityClient: GithubEntityClient;
}) => {
  const { actionsRegistry, githubEntityClient } = options;

  actionsRegistry.register({
    name: 'github:get-deployments',
    title: 'Get GitHub Deployments',
    description: 'Returns deployments for a GitHub repository in a date range.',
    schema: {
      input: z =>
        z.object({
          entity: z
            .object({
              kind: z.string(),
              metadata: z
                .object({
                  name: z.string(),
                  namespace: z.string(),
                  annotations: z.record(z.string()),
                })
                .passthrough(),
            })
            .passthrough(),
          from: z.string().datetime(),
          to: z.string().datetime(),
        }),
      output: z =>
        z.object({
          deployments: z.array(
            z.object({
              id: z.number(),
              sha: z.string(),
              createdAt: z.string(),
              environment: z.string(),
              status: z.string(),
            }),
          ),
        }),
    },
    attributes: {
      readOnly: true,
      idempotent: true,
      destructive: false,
    },
    action: async ({ input }) => {
      const fromDate = new Date(input.from);
      const toDate = new Date(input.to);
      if (fromDate >= toDate) {
        throw new Error('`from` must be before `to`');
      }

      if (toDate.getTime() - fromDate.getTime() > MAX_DEPLOYMENTS_WINDOW_MS) {
        throw new Error(
          'Date range is too large. Maximum supported window is 180 days.',
        );
      }

      const deployments = await githubEntityClient
        .forEntity(input.entity as Entity)
        .getDeployments(fromDate, toDate);

      return {
        output: {
          deployments,
        },
      };
    },
  });
};
