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
import { GithubClient } from '../github/GithubClient';
import { GithubDeploymentRangePullRequestsCollector } from './GithubDeploymentRangePullRequestsCollector';

describe('GithubDeploymentRangePullRequestsCollector', () => {
  it('collects pull requests for deployment commit range', async () => {
    const getCommitShasBetweenSpy = jest
      .spyOn(GithubClient.prototype, 'getCommitShasBetween')
      .mockResolvedValue(['sha-two', 'sha-three']);

    const getCommitPullRequestsSpy = jest
      .spyOn(GithubClient.prototype, 'getCommitPullRequests')
      .mockImplementation(async (_url, _repository, sha) => {
        if (sha === 'sha-two') {
          return [
            {
              number: 100,
              firstCommitAt: '2026-05-28T10:00:00.000Z',
            },
            {
              number: 101,
              firstCommitAt: '2026-05-30T10:00:00.000Z',
            },
          ];
        }

        return [
          {
            number: 101,
            firstCommitAt: '2026-05-30T10:00:00.000Z',
          },
        ];
      });

    const collector = GithubDeploymentRangePullRequestsCollector.fromConfig(
      new ConfigReader({
        integrations: {
          github: [
            {
              host: 'github.com',
              token: 'dummy-token',
            },
          ],
        },
      }),
    );

    const result = await collector.collect({
      entity: {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'service-a',
          annotations: {
            'github.com/project-slug': 'owner/repo',
            'backstage.io/source-location': 'url:https://github.com/owner/repo',
          },
        },
      },
      input: {
        baseCommitSha: 'sha-one',
        headCommitSha: 'sha-three',
      },
    });

    expect(result).toEqual({
      pullRequests: [
        {
          id: '100',
          firstCommitAt: '2026-05-28T10:00:00.000Z',
        },
        {
          id: '101',
          firstCommitAt: '2026-05-30T10:00:00.000Z',
        },
      ],
    });
    expect(getCommitShasBetweenSpy).toHaveBeenCalledTimes(1);
    expect(getCommitPullRequestsSpy).toHaveBeenCalledTimes(2);
  });
});
