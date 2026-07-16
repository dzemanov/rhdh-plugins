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

import type { Config } from '@backstage/config';
import type { Entity } from '@backstage/catalog-model';
import { DEFAULT_NUMBER_THRESHOLDS } from '@red-hat-developer-hub/backstage-plugin-scorecard-common';
import { JiraOpenIssuesProvider } from './JiraOpenIssuesProvider';
import { JiraClientFactory } from '../clients/JiraClientFactory';
import { JiraClient } from '../clients/base';
import {
  newEntityComponent,
  newMockRootConfig,
} from '../../__fixtures__/testUtils';
import { ScorecardJiraAnnotations } from '../annotations';
import { mockServices } from '@backstage/backend-test-utils';

const { PROJECT_KEY } = ScorecardJiraAnnotations;

jest.mock('../clients/JiraClientFactory');

const mockJiraClient = {
  getCountOpenIssues: jest.fn(),
} as unknown as jest.Mocked<JiraClient>;

const mockEntity: Entity = newEntityComponent({
  [PROJECT_KEY]: 'TEST',
});

describe('JiraOpenIssuesProvider', () => {
  let mockConfig: Config;
  let provider: JiraOpenIssuesProvider;
  const mockAuthOptions = {
    discovery: mockServices.discovery(),
    auth: mockServices.auth(),
  };
  const mockedJiraClientFactory = JiraClientFactory as jest.Mocked<
    typeof JiraClientFactory
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig = newMockRootConfig();
    mockedJiraClientFactory.fromConfig.mockReturnValue(mockJiraClient);
    provider = new JiraOpenIssuesProvider(
      JiraClientFactory.fromConfig(mockConfig, mockAuthOptions),
    );
  });

  describe('getProviderDatasourceId', () => {
    it('should return "jira"', () => {
      expect(provider.getProviderDatasourceId()).toEqual('jira');
    });
  });

  describe('getProviderId', () => {
    it('should return "jira.openIssues"', () => {
      expect(provider.getProviderId()).toEqual('jira.openIssues');
    });
  });

  describe('getMetrics', () => {
    it('should return correct metric metadata with threshold', () => {
      const metrics = provider.getMetrics();

      expect(metrics).toHaveLength(1);
      expect(metrics[0]).toEqual({
        id: 'jira.openIssues',
        title: 'Jira open blocking tickets',
        description:
          'Highlights the number of issues that are currently open in Jira.',
        type: 'number',
        thresholds: DEFAULT_NUMBER_THRESHOLDS,
        history: true,
      });
    });
  });

  describe('supportsEntity', () => {
    it('should return true when entity has project key annotation', () => {
      expect(provider.supportsEntity(mockEntity)).toBe(true);
    });

    it('should return false when entity does not have project key annotation', () => {
      const mockEmptyEntity: Entity = newEntityComponent({});

      expect(provider.supportsEntity(mockEmptyEntity)).toBe(false);
    });
  });

  describe('calculateMetrics', () => {
    it('should return the count of open issues when Jira client processed successfully', async () => {
      mockJiraClient.getCountOpenIssues.mockResolvedValue(5);

      const results = await provider.calculateMetrics(mockEntity);

      expect(results.get('jira.openIssues')).toBe(5);
      expect(mockJiraClient.getCountOpenIssues).toHaveBeenCalledWith(
        mockEntity,
      );
    });

    describe('when Jira client processed with error', () => {
      beforeEach(() => {
        mockJiraClient.getCountOpenIssues.mockRejectedValue(
          new Error('Jira API error'),
        );
      });

      it('should propagate errors from Jira client', async () => {
        await expect(provider.calculateMetrics(mockEntity)).rejects.toThrow(
          'Jira API error',
        );
        expect(mockJiraClient.getCountOpenIssues).toHaveBeenCalledWith(
          mockEntity,
        );
      });
    });
  });
});
