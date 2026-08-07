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

import {
  newEntityComponent,
  newMockRootConfig,
} from '../../__fixtures__/testUtils';
import {
  ScorecardJiraAnnotations,
  ScorecardJiraIncidentAnnotations,
} from '../annotations';
import { JiraClient } from '../clients/base';
import { JiraIncidentsCollector } from './JiraIncidentsCollector';

const { PROJECT_KEY } = ScorecardJiraAnnotations;
const { INCIDENT_PROJECT_KEY, INCIDENT_ISSUE_TYPE } =
  ScorecardJiraIncidentAnnotations;

describe('JiraIncidentsCollector', () => {
  const mockJiraClient = {
    getAnnotationFiltersFromEntity: jest.fn(),
    getIssues: jest.fn(),
  } as unknown as jest.Mocked<JiraClient>;

  let collector: JiraIncidentsCollector;

  const input = {
    from: '2026-06-01T00:00:00.000Z',
    to: '2026-06-30T23:59:59.999Z',
  };

  const mockEntity = newEntityComponent({
    [INCIDENT_PROJECT_KEY]: 'INC',
  });

  const defaultIncidents = [
    {
      id: 'INC-100',
      createdAt: '2026-06-01T10:00:00.000Z',
      resolutionAt: '2026-06-01T12:00:00.000Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockJiraClient.getAnnotationFiltersFromEntity.mockReturnValue({
      project: 'project = "INC"',
    });
    mockJiraClient.getIssues.mockResolvedValue(defaultIncidents);
    collector = JiraIncidentsCollector.fromConfig(
      newMockRootConfig(),
      mockJiraClient,
    );
  });

  describe('fromConfig', () => {
    it('should load issueType from app-config', () => {
      collector = JiraIncidentsCollector.fromConfig(
        newMockRootConfig({
          incidentOptions: { issueType: 'ServiceIncident' },
        }),
        mockJiraClient,
      );

      expect((collector as any).incidentOptions).toEqual({
        issueType: 'ServiceIncident',
      });
    });

    it('should leave empty options if not set in app-config', () => {
      collector = JiraIncidentsCollector.fromConfig(
        newMockRootConfig({}),
        mockJiraClient,
      );

      expect((collector as any).incidentOptions).toEqual({
        issueType: undefined,
      });
    });
  });

  describe('collect', () => {
    it('should return incidents when Jira client processed successfully', async () => {
      const result = await collector.collect({ entity: mockEntity, input });

      expect(result).toEqual({ incidents: defaultIncidents });
    });

    it('should propagate errors from Jira client', async () => {
      mockJiraClient.getIssues.mockRejectedValue(new Error('Jira API error'));

      await expect(
        collector.collect({ entity: mockEntity, input }),
      ).rejects.toThrow('Jira API error');
    });

    it('should use default issue type when app-config options are unset', async () => {
      await collector.collect({ entity: mockEntity, input });

      expect(mockJiraClient.getIssues).toHaveBeenCalledWith(
        '(project = "INC") AND (type = "Incident") AND (created >= "2026-06-01 00:00") AND (created <= "2026-06-30 23:59")',
      );
    });

    it('should overwrite default issue type with app-config issueType', async () => {
      collector = JiraIncidentsCollector.fromConfig(
        newMockRootConfig({
          incidentOptions: { issueType: 'ServiceIncident' },
        }),
        mockJiraClient,
      );

      await collector.collect({ entity: mockEntity, input });

      expect(mockJiraClient.getIssues).toHaveBeenCalledWith(
        '(project = "INC") AND (type = "ServiceIncident") AND (created >= "2026-06-01 00:00") AND (created <= "2026-06-30 23:59")',
      );
    });

    it('should include entity annotation filters with default issue type', async () => {
      mockJiraClient.getAnnotationFiltersFromEntity.mockReturnValue({
        project: 'project = "INC"',
        component: 'component = "Payments"',
        label: 'labels = "sev-1"',
      });

      await collector.collect({ entity: mockEntity, input });

      expect(mockJiraClient.getIssues).toHaveBeenCalledWith(
        '(project = "INC") AND (component = "Payments") AND (labels = "sev-1") AND (type = "Incident") AND (created >= "2026-06-01 00:00") AND (created <= "2026-06-30 23:59")',
      );
    });

    it('should apply app-config issueType with entity annotation filters', async () => {
      collector = JiraIncidentsCollector.fromConfig(
        newMockRootConfig({
          incidentOptions: { issueType: 'ServiceIncident' },
        }),
        mockJiraClient,
      );
      mockJiraClient.getAnnotationFiltersFromEntity.mockReturnValue({
        project: 'project = "INC"',
        component: 'component = "Payments"',
      });

      await collector.collect({ entity: mockEntity, input });

      expect(mockJiraClient.getIssues).toHaveBeenCalledWith(
        '(project = "INC") AND (component = "Payments") AND (type = "ServiceIncident") AND (created >= "2026-06-01 00:00") AND (created <= "2026-06-30 23:59")',
      );
    });

    it('should prefer entity issue-type annotation over app-config', async () => {
      collector = JiraIncidentsCollector.fromConfig(
        newMockRootConfig({
          incidentOptions: { issueType: 'ServiceIncident' },
        }),
        mockJiraClient,
      );

      await collector.collect({
        entity: newEntityComponent({
          [INCIDENT_PROJECT_KEY]: 'INC',
          [INCIDENT_ISSUE_TYPE]: 'ProductionIncident',
        }),
        input,
      });

      expect(mockJiraClient.getIssues).toHaveBeenCalledWith(
        expect.stringContaining('(type = "ProductionIncident")'),
      );
      expect(mockJiraClient.getIssues).toHaveBeenCalledWith(
        expect.not.stringContaining('(type = "ServiceIncident")'),
      );
    });

    it('should pass projectFallback when resolving annotation filters', async () => {
      await collector.collect({
        entity: newEntityComponent({ [PROJECT_KEY]: 'PROJ' }),
        input,
      });

      expect(
        mockJiraClient.getAnnotationFiltersFromEntity,
      ).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
        projectFallback: PROJECT_KEY,
      });
    });
  });
});
