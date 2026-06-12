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
import { DefaultGithubCredentialsProvider } from '@backstage/integration';
import { GithubClient } from './GithubClient';
import { GithubRepository } from './types';

describe('GithubClient', () => {
  let githubClient: GithubClient;
  const mockedGraphqlClient = jest.fn();
  const repository: GithubRepository = {
    owner: 'owner',
    repo: 'repo',
  };

  const getCredentialsSpy = jest
    .spyOn(DefaultGithubCredentialsProvider.prototype, 'getCredentials')
    .mockResolvedValue({
      type: 'token',
      headers: { Authorization: 'Bearer dummy-token' },
      token: 'dummy-token',
    });

  beforeEach(() => {
    jest.clearAllMocks();

    // @ts-ignore
    jest.unstable_mockModule('@octokit/graphql', async () => ({
      graphql: {
        defaults: () => mockedGraphqlClient,
      },
    }));

    const mockConfig = new ConfigReader({
      integrations: {
        github: [
          {
            host: 'github.com',
            token: 'dummy-token',
          },
        ],
      },
    });
    githubClient = new GithubClient(mockConfig);
  });

  describe('getOpenPullRequestsCount', () => {
    it('should return the count of open pull requests', async () => {
      const url = `https://github.com/owner/repo`;
      const response = {
        repository: {
          pullRequests: {
            totalCount: 42,
          },
        },
      };
      mockedGraphqlClient.mockResolvedValue(response);

      const result = await githubClient.getOpenPullRequestsCount(
        url,
        repository,
      );

      expect(result).toBe(42);
      expect(mockedGraphqlClient).toHaveBeenCalledTimes(1);
      expect(mockedGraphqlClient).toHaveBeenCalledWith(
        expect.stringContaining('query getOpenPRsCount'),
        repository,
      );
      expect(getCredentialsSpy).toHaveBeenCalledWith({
        url,
      });
    });

    it('should throw error when GitHub integration for URL is missing', async () => {
      const unknownUrl = 'https://unknown-host/owner/repo';
      await expect(
        githubClient.getOpenPullRequestsCount(unknownUrl, repository),
      ).rejects.toThrow(`Missing GitHub integration for '${unknownUrl}'`);
    });
  });

  describe('getDeployments', () => {
    it('should return deployments filtered by date window', async () => {
      const url = `https://github.com/owner/repo`;
      const from = '2026-05-01T00:00:00.000Z';
      const to = '2026-05-31T23:59:59.000Z';
      mockedGraphqlClient.mockResolvedValue({
        repository: {
          deployments: {
            nodes: [
              {
                databaseId: 101,
                commitOid: 'sha-within-window',
                createdAt: '2026-05-15T10:00:00.000Z',
                environment: 'production',
                latestStatus: { state: 'SUCCESS' },
              },
              {
                databaseId: 102,
                commitOid: 'sha-outside-window',
                createdAt: '2026-04-01T10:00:00.000Z',
                environment: 'production',
                latestStatus: { state: 'FAILURE' },
              },
            ],
            pageInfo: {
              hasNextPage: false,
              endCursor: null,
            },
          },
        },
      });

      const deployments = await githubClient.getDeployments(
        url,
        repository,
        from,
        to,
      );

      expect(deployments).toEqual([
        {
          id: 101,
          sha: 'sha-within-window',
          createdAt: '2026-05-15T10:00:00.000Z',
          environment: 'production',
          status: 'SUCCESS',
        },
      ]);
      expect(mockedGraphqlClient).toHaveBeenCalledTimes(1);
      expect(mockedGraphqlClient).toHaveBeenCalledWith(
        expect.stringContaining('query getDeployments'),
        expect.objectContaining({
          owner: repository.owner,
          repo: repository.repo,
          after: null,
        }),
      );
      expect(getCredentialsSpy).toHaveBeenCalledWith({ url });
    });
  });

  describe('getCommitPullRequests', () => {
    it('should return pull requests linked to a commit sha', async () => {
      const url = `https://github.com/owner/repo`;
      const sha = '6f9cb0a3627d4f0f194f2efce2685f6f6fd7f8a1';
      mockedGraphqlClient.mockResolvedValue({
        repository: {
          object: {
            associatedPullRequests: {
              nodes: [
                {
                  number: 123,
                  mergedAt: '2026-06-01T12:00:00.000Z',
                },
              ],
            },
          },
        },
      });

      const pullRequests = await githubClient.getCommitPullRequests(
        url,
        repository,
        sha,
      );

      expect(pullRequests).toEqual([
        {
          number: 123,
          mergedAt: '2026-06-01T12:00:00.000Z',
        },
      ]);
      expect(mockedGraphqlClient).toHaveBeenCalledTimes(1);
      expect(mockedGraphqlClient).toHaveBeenCalledWith(
        expect.stringContaining('query getCommitPullRequests'),
        expect.objectContaining({
          owner: repository.owner,
          repo: repository.repo,
          sha,
        }),
      );
      expect(getCredentialsSpy).toHaveBeenCalledWith({ url });
    });
  });
});
