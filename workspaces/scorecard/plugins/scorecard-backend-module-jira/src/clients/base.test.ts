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
  ScorecardJiraAnnotations,
  ScorecardJiraIncidentAnnotations,
  incidentAnnotationFilters,
  openIssuesAnnotationFilters,
} from '../annotations';
import { newEntityComponent } from '../../__fixtures__/testUtils';
import type { ConnectionStrategy } from '../strategies/ConnectionStrategy';
import { JiraClient } from './base';
import type { JiraIssue, Method } from './types';
import { JsonObject } from '@backstage/types';
import z from 'zod';

const { PROJECT_KEY, COMPONENT, LABEL, TEAM, CUSTOM_FILTER } =
  ScorecardJiraAnnotations;

const {
  INCIDENT_PROJECT_KEY,
  INCIDENT_COMPONENT,
  INCIDENT_LABEL,
  INCIDENT_TEAM,
  INCIDENT_CUSTOM_FILTER,
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

  public getIncidentIssues(_jql: string): Promise<JiraIssue[]> {
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
  let mockConnectionStrategy: ConnectionStrategy;

  const mockMethod = 'GET';
  const mockURL = 'https://example.com/api';
  const mockResponse = { data: { total: 10 } };

  beforeEach(() => {
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

    testJiraClient = new TestJiraClient(mockConnectionStrategy);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should have api version', () => {
      expect((testJiraClient as any).getApiVersion()).toEqual(3);
    });

    it('should have connection strategy', () => {
      const client = new TestJiraClient(mockConnectionStrategy);

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
    it('should request open issues count with jql and return extracted count', async () => {
      jest
        .spyOn(testJiraClient as any, 'extractIssueCountFromResponse')
        .mockReturnValue(7);
      (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ count: 7 }),
      });

      const count = await testJiraClient.getCountOpenIssues('project = "TEST"');

      expect(count).toEqual(7);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://example.com/api/rest/api/3/search',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Basic Fds31dsF32',
          }),
          body: JSON.stringify({ jql: 'project = "TEST"' }),
        }),
      );
      expect(testJiraClient.extractIssueCountFromResponse).toHaveBeenCalledWith(
        { count: 7 },
      );
    });
  });
});
