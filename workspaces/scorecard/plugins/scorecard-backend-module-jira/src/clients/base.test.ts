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
import type { JsonObject } from '@backstage/types';
import { z } from 'zod';
import { JiraClient } from './base';
import {
  ScorecardJiraAnnotations,
  ScorecardJiraIncidentAnnotations,
  incidentAnnotationFilters,
  openIssuesAnnotationFilters,
} from '../annotations';
import { ConnectionStrategy } from '../strategies/ConnectionStrategy';
import {
  newEntityComponent,
  newMockRootConfig,
} from '../../__fixtures__/testUtils';
import type { JiraIssue, Method } from './types';
import { Entity } from '@backstage/catalog-model';

const { PROJECT_KEY, COMPONENT, LABEL, TEAM, CUSTOM_FILTER } =
  ScorecardJiraAnnotations;

const {
  INCIDENT_PROJECT_KEY,
  INCIDENT_COMPONENT,
  INCIDENT_LABEL,
  INCIDENT_TEAM,
  INCIDENT_CUSTOM_FILTER,
  INCIDENT_ISSUE_TYPE,
} = ScorecardJiraIncidentAnnotations;

class TestJiraClient extends JiraClient {
  getSearchCountEndpoint(): string {
    return '/search';
  }

  buildSearchBody(jql: string): string {
    return JSON.stringify({ jql });
  }

  extractIssueCountFromResponse(): number {
    return 10;
  }

  getApiVersion(): number {
    return 3;
  }

  public getIncidentIssues(
    _entity: Entity,
    _options: { from: string; to: string },
  ): Promise<JiraIssue[]> {
    throw new Error('Method not implemented.');
  }

  public sendPaginatedRequest<TPage, TOut>(_options: {
    url: string;
    method: Method;
    body?: JsonObject;
    responseSchema: z.ZodType<TPage>;
    mapper: (page: TPage) => TOut[];
    fetchItemsLimit?: number;
  }): Promise<TOut[]> {
    throw new Error('Method not implemented.');
  }
}

globalThis.fetch = jest.fn();

describe('JiraClient', () => {
  let testJiraClient: TestJiraClient;
  let mockRootConfig: Config;
  let mockConnectionStrategy: ConnectionStrategy;

  const mockMethod = 'GET';
  const mockURL = 'https://example.com/api';
  const mockResponse = { data: { total: 10 } };

  beforeEach(() => {
    const options = {
      mandatoryFilter: 'type = Task AND resolution = Resolved',
      customFilter: 'assignee = testerUser',
    };

    mockRootConfig = newMockRootConfig({ options });

    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ total: 10 }),
    });

    mockConnectionStrategy = {
      getBaseUrl: jest
        .fn()
        .mockReturnValue('https://example.com/api/rest/api/3'),
      getAuthHeaders: jest
        .fn()
        .mockResolvedValue({ Authorization: 'Basic Fds31dsF32' }),
    };

    testJiraClient = new TestJiraClient(mockRootConfig, mockConnectionStrategy);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create api version', () => {
      expect((testJiraClient as any).getApiVersion()).toEqual(3);
    });

    it('should create correct options', () => {
      expect((testJiraClient as any).options).toEqual({
        mandatoryFilter: 'type = Task AND resolution = Resolved',
        customFilter: 'assignee = testerUser',
      });
    });

    it('should create connection strategy', () => {
      const client = new TestJiraClient(mockRootConfig, mockConnectionStrategy);

      expect((client as any).connectionStrategy).toBe(mockConnectionStrategy);
    });
  });

  describe('sendRequest', () => {
    describe('when request is successful', () => {
      beforeEach(() => {
        (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValueOnce(mockResponse),
        });
      });

      it('should use applied URL method and default headers', () => {
        (testJiraClient as any).sendRequest({
          url: mockURL,
          method: mockMethod,
        });
        expect(globalThis.fetch).toHaveBeenCalledWith(
          mockURL,
          expect.objectContaining({
            method: mockMethod,
            headers: expect.objectContaining({
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'X-Atlassian-Token': 'no-check',
            }),
          }),
        );
      });

      it('should add additional header when provided', () => {
        (testJiraClient as any).sendRequest({
          url: mockURL,
          method: mockMethod,
          headers: { Authorization: `Bearer test-token` },
        });
        expect(globalThis.fetch).toHaveBeenCalledWith(
          mockURL,
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: `Bearer test-token`,
            }),
          }),
        );
      });

      it('should add body when provided', () => {
        (testJiraClient as any).sendRequest({
          url: mockURL,
          method: mockMethod,
          body: 'maxResults: 0',
        });
        expect(globalThis.fetch).toHaveBeenCalledWith(
          mockURL,
          expect.objectContaining({
            body: 'maxResults: 0',
          }),
        );
      });
    });

    describe('when request fails', () => {
      beforeEach(() => {
        (globalThis.fetch as jest.Mock).mockReset();
      });

      it('should throw error when status is not ok', async () => {
        (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
          ok: false,
          status: 404,
        });

        await expect(
          (testJiraClient as any).sendRequest({
            url: mockURL,
            method: mockMethod,
          }),
        ).rejects.toThrow('Jira request failed with status 404');
      });

      it('should throw error when fetch throws', async () => {
        (globalThis.fetch as jest.Mock).mockRejectedValueOnce(
          new Error('Network error'),
        );

        await expect(
          (testJiraClient as any).sendRequest({
            url: mockURL,
            method: mockMethod,
          }),
        ).rejects.toThrow('Jira error message: Network error');
      });
    });
  });

  describe('getAnnotationFiltersFromEntity', () => {
    const annotationFilterCases = [
      {
        name: 'open issues',
        keys: openIssuesAnnotationFilters,
        options: undefined,
        missingProjectError: `Missing required '${PROJECT_KEY}' annotation for entity 'mock-entity'`,
      },
      {
        name: 'incidents',
        keys: incidentAnnotationFilters,
        options: { projectFallback: PROJECT_KEY },
        missingProjectError: `Missing required '${INCIDENT_PROJECT_KEY}' or '${PROJECT_KEY}' annotation for entity 'mock-entity'`,
      },
    ] as const;

    it.each(annotationFilterCases)(
      '$name: should extract project filter correctly when entity has only "project key"',
      ({ keys, options }) => {
        const entity = newEntityComponent({ [keys.project]: 'TEST' });
        const filters = (testJiraClient as any).getAnnotationFiltersFromEntity(
          entity,
          keys,
          options,
        );

        expect(filters).toEqual({
          project: 'project = "TEST"',
        });
      },
    );

    it.each(annotationFilterCases)(
      '$name: should throw error for missing project key when entity is missing "project key"',
      ({ keys, options, missingProjectError }) => {
        const entity = newEntityComponent({});

        expect(() =>
          (testJiraClient as any).getAnnotationFiltersFromEntity(
            entity,
            keys,
            options,
          ),
        ).toThrow(missingProjectError);
      },
    );

    it.each(annotationFilterCases)(
      '$name: should throw error for invalid "project key" when "project key" is invalid',
      ({ keys, options }) => {
        const entity = newEntityComponent({ [keys.project]: 'TEST$123' });

        expect(() =>
          (testJiraClient as any).getAnnotationFiltersFromEntity(
            entity,
            keys,
            options,
          ),
        ).toThrow(
          `${keys.project} contains invalid characters. Only alphanumeric, hyphens, spaces, and underscores are allowed.`,
        );
      },
    );

    it.each(annotationFilterCases)(
      '$name: should extract all filters correctly when entity has all expected annotations',
      ({ keys, options }) => {
        const entity = newEntityComponent({
          [keys.project]: 'TEST',
          [keys.component]: 'backend',
          [keys.label]: 'critical',
          [keys.team]: '4316',
          [keys.customFilter]: 'priority = High',
        });

        const filters = (testJiraClient as any).getAnnotationFiltersFromEntity(
          entity,
          keys,
          options,
        );

        expect(filters).toEqual({
          project: 'project = "TEST"',
          component: 'component = "backend"',
          label: 'labels = "critical"',
          team: 'team = 4316',
          customFilter: 'priority = High',
        });
      },
    );

    it.each(annotationFilterCases)(
      '$name: should throw error for invalid "component" when "component" is invalid',
      ({ keys, options }) => {
        const entity = newEntityComponent({
          [keys.project]: 'TEST',
          [keys.component]: 'backend$123',
        });

        expect(() =>
          (testJiraClient as any).getAnnotationFiltersFromEntity(
            entity,
            keys,
            options,
          ),
        ).toThrow(
          `${keys.component} contains invalid characters. Only alphanumeric, hyphens, spaces, and underscores are allowed.`,
        );
      },
    );

    it.each(annotationFilterCases)(
      '$name: should throw error for invalid "label" when "label" is invalid',
      ({ keys, options }) => {
        const entity = newEntityComponent({
          [keys.project]: 'TEST',
          [keys.label]: 'critical$123',
        });

        expect(() =>
          (testJiraClient as any).getAnnotationFiltersFromEntity(
            entity,
            keys,
            options,
          ),
        ).toThrow(
          `${keys.label} contains invalid characters. Only alphanumeric, hyphens, spaces, and underscores are allowed.`,
        );
      },
    );

    it.each(annotationFilterCases)(
      '$name: should throw error for invalid "team" when "team" is invalid',
      ({ keys, options }) => {
        const entity = newEntityComponent({
          [keys.project]: 'TEST',
          [keys.team]: 'team-alpha$123',
        });

        expect(() =>
          (testJiraClient as any).getAnnotationFiltersFromEntity(
            entity,
            keys,
            options,
          ),
        ).toThrow(
          `${keys.team} contains invalid characters. Only alphanumeric, hyphens, and underscores are allowed.`,
        );
      },
    );

    it('incidents: should fall back to project key when incident project key is missing', () => {
      const entity = newEntityComponent({
        [PROJECT_KEY]: 'PROJ',
      });

      const filters = (testJiraClient as any).getAnnotationFiltersFromEntity(
        entity,
        incidentAnnotationFilters,
        { projectFallback: PROJECT_KEY },
      );

      expect(filters).toEqual({
        project: 'project = "PROJ"',
      });
    });

    it('incidents: should apply incident-specific component, label, team, and custom filter', () => {
      const entity = newEntityComponent({
        [INCIDENT_PROJECT_KEY]: 'INC',
        [INCIDENT_COMPONENT]: 'Payments',
        [INCIDENT_LABEL]: 'sev-1',
        [INCIDENT_TEAM]: 'team-ops',
        [INCIDENT_CUSTOM_FILTER]: 'priority = Highest',
        [COMPONENT]: 'Ignored',
        [LABEL]: 'ignored-label',
        [TEAM]: 'ignored-team',
        [CUSTOM_FILTER]: 'ignored = true',
      });

      const filters = (testJiraClient as any).getAnnotationFiltersFromEntity(
        entity,
        incidentAnnotationFilters,
        { projectFallback: PROJECT_KEY },
      );

      expect(filters).toEqual({
        project: 'project = "INC"',
        component: 'component = "Payments"',
        label: 'labels = "sev-1"',
        team: 'team = team-ops',
        customFilter: 'priority = Highest',
      });
    });
  });

  describe('buildIncidentJqlFilters', () => {
    const options = {
      from: '2026-06-01T00:00:00.000Z',
      to: '2026-06-30T23:59:59.999Z',
    };

    it('should build JQL using incident project key and date bounds', () => {
      const entity = newEntityComponent({
        [INCIDENT_PROJECT_KEY]: 'INC',
        [PROJECT_KEY]: 'PROJ',
      });

      const jql = (testJiraClient as any).buildIncidentJqlFilters(
        entity,
        options,
      );

      expect(jql).toBe(
        '(project = "INC") AND (type = "Incident") AND (created >= "2026-06-01 00:00") AND (created <= "2026-06-30 23:59")',
      );
    });

    it('should include optional incident filters in JQL', () => {
      const entity = newEntityComponent({
        [INCIDENT_PROJECT_KEY]: 'INC',
        [INCIDENT_COMPONENT]: 'Payments',
        [INCIDENT_LABEL]: 'sev-1',
      });

      const jql = (testJiraClient as any).buildIncidentJqlFilters(
        entity,
        options,
      );

      expect(jql).toBe(
        '(project = "INC") AND (component = "Payments") AND (labels = "sev-1") AND (type = "Incident") AND (created >= "2026-06-01 00:00") AND (created <= "2026-06-30 23:59")',
      );
    });

    it('should use incident issue type from entity annotation', () => {
      const entity = newEntityComponent({
        [INCIDENT_PROJECT_KEY]: 'INC',
        [INCIDENT_ISSUE_TYPE]: 'Production Incident',
      });

      const jql = (testJiraClient as any).buildIncidentJqlFilters(
        entity,
        options,
      );

      expect(jql).toContain('(type = "Production Incident")');
    });

    it('should use incident issue type from app-config when annotation is not set', () => {
      const config = newMockRootConfig({
        options: {
          mandatoryFilter: 'type = Task AND resolution = Resolved',
          customFilter: 'priority in ("Critical", "Blocker")',
        },
        incidentOptions: {
          issueType: 'Service Incident',
        },
      });
      testJiraClient = new TestJiraClient(config, mockConnectionStrategy);

      const entity = newEntityComponent({
        [INCIDENT_PROJECT_KEY]: 'INC',
      });

      const jql = (testJiraClient as any).buildIncidentJqlFilters(
        entity,
        options,
      );

      expect(jql).toContain('(type = "Service Incident")');
    });

    it('should prefer entity annotation issue type over app-config', () => {
      const config = newMockRootConfig({
        incidentOptions: {
          issueType: 'Service Incident',
        },
      });
      testJiraClient = new TestJiraClient(config, mockConnectionStrategy);

      const entity = newEntityComponent({
        [INCIDENT_PROJECT_KEY]: 'INC',
        [INCIDENT_ISSUE_TYPE]: 'Production Incident',
      });

      const jql = (testJiraClient as any).buildIncidentJqlFilters(
        entity,
        options,
      );

      expect(jql).toContain('(type = "Production Incident")');
      expect(jql).not.toContain('(type = "Service Incident")');
    });

    it('should fall back to project key when incident project key is missing', () => {
      const entity = newEntityComponent({
        [PROJECT_KEY]: 'PROJ',
      });

      const jql = (testJiraClient as any).buildIncidentJqlFilters(
        entity,
        options,
      );

      expect(jql).toContain('(project = "PROJ")');
      expect(jql).toContain('(type = "Incident")');
    });

    it('should throw when neither incident nor project key annotation is present', () => {
      const entity = newEntityComponent();

      expect(() =>
        (testJiraClient as any).buildIncidentJqlFilters(entity, options),
      ).toThrow(
        `Missing required '${INCIDENT_PROJECT_KEY}' or '${PROJECT_KEY}' annotation for entity 'mock-entity'`,
      );
    });
  });

  describe('buildJqlFilters', () => {
    it('should use provided mandatory filter when mandatory filter is provided in options', () => {
      const filters = { project: 'project = "MOON"' };
      const jql = (testJiraClient as any).buildJqlFilters(filters);
      const jqlFilters = jql.split(' AND ');

      expect(jqlFilters).toHaveLength(4);
      expect(jqlFilters).toContain('(project = "MOON")');
    });

    it('should use default mandatory filter when mandatory filter is not provided in options', () => {
      const config = newMockRootConfig({
        options: {
          mandatoryFilter: 'team = 4316',
        },
      });

      testJiraClient = new TestJiraClient(config, mockConnectionStrategy);

      const jql = (testJiraClient as any).buildJqlFilters({});
      expect(jql).toBe('(team = 4316)');
    });

    it('should use provided annotation custom filter when custom filter is provided in annotation and options', () => {
      const jql = (testJiraClient as any).buildJqlFilters({
        customFilter: 'assignee = Automobile',
      });
      const jqlFilters = jql.split(' AND ');

      expect(jqlFilters).toHaveLength(3);
      expect(jqlFilters).toContain('(assignee = Automobile)');
    });

    it('should use provided annotation custom filter when custom filter is provided in annotation and not in options', () => {
      const config = newMockRootConfig({
        options: {
          mandatoryFilter: 'resolution = Unresolved',
        },
      });
      testJiraClient = new TestJiraClient(config, mockConnectionStrategy);

      const jql = (testJiraClient as any).buildJqlFilters({
        customFilter: 'assignee = Robot',
      });
      expect(jql).toBe('(assignee = Robot) AND (resolution = Unresolved)');
    });

    it('should use provided options custom filter when custom filter is provided in options and not in annotation', () => {
      const jql = (testJiraClient as any).buildJqlFilters({});
      const jqlFilters = jql.split(' AND ');

      expect(jqlFilters).toHaveLength(3);
      expect(jqlFilters).toContain('(assignee = testerUser)');
    });

    it('should not use any custom filters when custom filter is not provided in annotation and options', () => {
      const config = newMockRootConfig();

      const client = new TestJiraClient(config, mockConnectionStrategy);

      const jql = (client as any).buildJqlFilters({});

      expect(jql).toContain('(type = Bug AND resolution = Unresolved)');
    });
  });

  describe('getBaseUrl', () => {
    it('should return URL', async () => {
      const baseUrl = await (testJiraClient as any).getBaseUrl();
      expect(baseUrl).toEqual('https://example.com/api/rest/api/3');
    });

    it('should get api version', async () => {
      await (testJiraClient as any).getBaseUrl();
      expect(mockConnectionStrategy.getBaseUrl).toHaveBeenCalledWith(3);
    });
  });

  describe('getAuthHeaders', () => {
    it('should return auth header', async () => {
      const authHeaders = await (testJiraClient as any).getAuthHeaders();
      expect(authHeaders).toEqual({ Authorization: 'Basic Fds31dsF32' });
    });
  });

  describe('getCountOpenIssues', () => {
    const mockEntity = newEntityComponent({ [PROJECT_KEY]: 'TEST' });

    it('should return count of open issues', async () => {
      const count = await (testJiraClient as any).getCountOpenIssues(
        mockEntity,
      );
      expect(count).toEqual(10);
    });
  });
});
