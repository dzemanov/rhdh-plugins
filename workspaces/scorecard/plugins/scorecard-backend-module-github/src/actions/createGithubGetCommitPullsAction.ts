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

export const createGithubGetCommitPullsAction = (options: {
  actionsRegistry: ActionsRegistryService;
  githubEntityClient: GithubEntityClient;
}) => {
  const { actionsRegistry, githubEntityClient } = options;

  actionsRegistry.register({
    name: 'github:get-commit-pulls',
    title: 'Get Commit Pull Requests',
    description:
      'Returns pull requests associated with a GitHub commit SHA for scorecard DORA calculations.',
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
          sha: z.string(),
        }),
      output: z =>
        z.object({
          pullRequests: z.array(
            z.object({
              number: z.number(),
              mergedAt: z.string().optional(),
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
      const pullRequests = await githubEntityClient.getCommitPullRequests(
        input.entity as Entity,
        input.sha,
      );

      return {
        output: {
          pullRequests,
        },
      };
    },
  });
};
