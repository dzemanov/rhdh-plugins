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
import {
  JiraEntityFilters,
  JiraEntityIncidentFilters,
  JiraIssue,
  JiraOptions,
  RequestOptions,
} from './types';
import { JIRA_MANDATORY_FILTER, OPEN_ISSUES_CONFIG_PATH } from '../constants';
import { ScorecardJiraAnnotations } from '../annotations';
import {
  sanitizeValue,
  toIsoDateTime,
  toJiraDateTime,
  validateIdentifier,
  validateJQLValue,
} from './utils';
import { ConnectionStrategy } from '../strategies/ConnectionStrategy';

const {
  PROJECT_KEY,
  INCIDENT_PROJECT_KEY,
  COMPONENT,
  LABEL,
  TEAM,
  CUSTOM_FILTER,
} = ScorecardJiraAnnotations;

export abstract class JiraClient {
  protected readonly options?: JiraOptions;
  protected readonly connectionStrategy: ConnectionStrategy;

  constructor(rootConfig: Config, connectionStrategy: ConnectionStrategy) {
    this.connectionStrategy = connectionStrategy;

    const jiraOptions = rootConfig.getOptionalConfig(
      `${OPEN_ISSUES_CONFIG_PATH}.options`,
    );
    if (jiraOptions) {
      this.options = {
        mandatoryFilter: jiraOptions.getOptionalString('mandatoryFilter'),
        customFilter: jiraOptions.getOptionalString('customFilter'),
      };
    }
  }

  protected abstract getSearchCountEndpoint(): string;

  protected abstract getSearchEndpoint(): string;

  protected abstract buildSearchBody(jql: string): string;

  protected abstract extractIssueCountFromResponse(data: unknown): number;

  protected abstract getApiVersion(): number;

  protected async sendRequest({
    url,
    method,
    headers = {},
    body = '',
  }: RequestOptions): Promise<unknown> {
    try {
      const response = await fetch(url, {
        method,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Atlassian-Token': 'no-check',
          ...headers,
        },
        body,
      });

      if (!response.ok) {
        throw new Error(`Jira request failed with status ${response.status}`);
      }

      return response.json();
    } catch (error) {
      throw new Error(
        `Jira error message: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  protected getFiltersFromEntity(entity: Entity): JiraEntityFilters {
    const annotations = entity?.metadata?.annotations || {};

    const projectKey = annotations[PROJECT_KEY];
    if (!projectKey) {
      throw new Error(
        `Missing required '${PROJECT_KEY}' annotation for entity '${
          entity.metadata?.name || 'unknown'
        }'`,
      );
    }

    const sanitizedProjectKey = sanitizeValue(projectKey);
    const filters: JiraEntityFilters = {
      project: `project = "${validateJQLValue(
        sanitizedProjectKey,
        PROJECT_KEY,
      )}"`,
    };

    const component = annotations[COMPONENT];
    if (component) {
      const sanitizedComponent = sanitizeValue(component);
      filters.component = `component = "${validateJQLValue(
        sanitizedComponent,
        COMPONENT,
      )}"`;
    }

    const label = annotations[LABEL];
    if (label) {
      const sanitizedLabel = sanitizeValue(label);
      filters.label = `labels = "${validateJQLValue(sanitizedLabel, LABEL)}"`;
    }

    const team = annotations[TEAM];
    if (team) {
      const sanitizedTeam = sanitizeValue(team);
      filters.team = `team = ${validateIdentifier(sanitizedTeam, TEAM)}`;
    }

    const customFilter = annotations[CUSTOM_FILTER];
    if (customFilter) {
      filters.customFilter = customFilter;
    }

    return filters;
  }

  protected getIncidentFiltersFromEntity(
    entity: Entity,
  ): JiraEntityIncidentFilters {
    const annotations = entity?.metadata?.annotations || {};
    const incidentProjectKey =
      annotations[INCIDENT_PROJECT_KEY] ?? annotations[PROJECT_KEY];

    if (!incidentProjectKey) {
      throw new Error(
        `Missing required '${INCIDENT_PROJECT_KEY}' or '${PROJECT_KEY}' annotation for entity '${
          entity.metadata?.name || 'unknown'
        }'`,
      );
    }

    const sanitizedIncidentProjectKey = sanitizeValue(incidentProjectKey);
    return {
      project: `project = "${validateJQLValue(
        sanitizedIncidentProjectKey,
        annotations[INCIDENT_PROJECT_KEY] ? INCIDENT_PROJECT_KEY : PROJECT_KEY,
      )}"`,
    };
  }

  protected buildJqlFilters(filters: JiraEntityFilters): string {
    const { customFilter: annotationCustomFilter } = filters;
    const { mandatoryFilter, customFilter: optionsCustomFilter } =
      this.options || {};

    const defaultFilterQuery = mandatoryFilter ?? JIRA_MANDATORY_FILTER;

    const customFilterQuery =
      !annotationCustomFilter && optionsCustomFilter
        ? optionsCustomFilter
        : null;

    return Object.values({
      ...filters,
      defaultFilterQuery,
      customFilterQuery,
    })
      .filter(value => value && value !== '')
      .map(value => `(${value})`)
      .join(' AND ');
  }

  protected async getBaseUrl(): Promise<string> {
    const apiVersion = this.getApiVersion();
    return this.connectionStrategy.getBaseUrl(apiVersion);
  }

  protected async getAuthHeaders(): Promise<Record<string, string>> {
    return this.connectionStrategy.getAuthHeaders();
  }

  public async getCountOpenIssues(entity: Entity): Promise<number> {
    const baseUrl = await this.getBaseUrl();
    const countOpenIssuesUrl = `${baseUrl}${this.getSearchCountEndpoint()}`;

    const filters = this.getFiltersFromEntity(entity);
    const jql = this.buildJqlFilters(filters);
    const headers = await this.getAuthHeaders();

    const data = await this.sendRequest({
      method: 'POST',
      url: countOpenIssuesUrl,
      headers,
      body: this.buildSearchBody(jql),
    });

    return this.extractIssueCountFromResponse(data);
  }

  public async getIncidentIssues(
    entity: Entity,
    options: {
      from: string;
      to: string;
    },
  ): Promise<JiraIssue[]> {
    const baseUrl = await this.getBaseUrl();
    const searchUrl = `${baseUrl}${this.getSearchEndpoint()}`;
    const headers = await this.getAuthHeaders();

    const filters = this.getIncidentFiltersFromEntity(entity);
    const from = toJiraDateTime(options.from);
    const to = toJiraDateTime(options.to);
    const jql = `${filters.project} AND type = Incident AND created >= "${from}" AND created <= "${to}"`;

    const data = await this.sendRequest({
      method: 'POST',
      url: searchUrl,
      headers,
      body: JSON.stringify({
        jql,
        fields: ['created', 'resolutiondate'],
        maxResults: 1000,
      }),
    });

    if (
      !data ||
      typeof data !== 'object' ||
      !('issues' in data) ||
      !Array.isArray(data.issues)
    ) {
      throw new Error('Incorrect response data for Jira issues search');
    }

    return data.issues
      .map(issue => {
        if (
          !issue ||
          typeof issue !== 'object' ||
          !('id' in issue) ||
          typeof issue.id !== 'string' ||
          !('fields' in issue) ||
          !issue.fields ||
          typeof issue.fields !== 'object' ||
          !('created' in issue.fields) ||
          typeof issue.fields.created !== 'string'
        ) {
          return undefined;
        }
        const resolutionDate =
          'resolutiondate' in issue.fields &&
          (typeof issue.fields.resolutiondate === 'string' ||
            issue.fields.resolutiondate === null)
            ? issue.fields.resolutiondate
            : null;

        return {
          id: issue.id,
          createdAt: toIsoDateTime(issue.fields.created),
          resolutionDate: resolutionDate ? toIsoDateTime(resolutionDate) : null,
        };
      })
      .filter((issue): issue is JiraIssue => Boolean(issue));
  }
}
