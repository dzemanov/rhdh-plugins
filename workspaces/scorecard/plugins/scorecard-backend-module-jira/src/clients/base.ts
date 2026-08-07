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

import type { Entity } from '@backstage/catalog-model';
import type { JsonObject } from '@backstage/types';
import type { z } from 'zod';
import { JiraEntityFilters, JiraIssue, Method, RequestOptions } from './types';
import { sanitizeValue, validateIdentifier, validateJQLValue } from './utils';
import { ConnectionStrategy } from '../strategies/ConnectionStrategy';

export abstract class JiraClient {
  protected readonly connectionStrategy: ConnectionStrategy;

  constructor(connectionStrategy: ConnectionStrategy) {
    this.connectionStrategy = connectionStrategy;
  }

  protected abstract getSearchCountEndpoint(): string;

  protected abstract buildSearchBody(jql: string): string;

  protected abstract extractIssueCountFromResponse(data: unknown): number;

  protected abstract getApiVersion(): number;

  public abstract getIncidentIssues(jql: string): Promise<JiraIssue[]>;

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

  public abstract sendPaginatedRequest<TPage, TOut>(options: {
    url: string;
    method: Method;
    body?: JsonObject;
    responseSchema: z.ZodType<TPage>;
    mapper: (page: TPage) => TOut[];
    /**
     * Client-side cap on total mapped items across all pages.
     * Defaults to 1000.
     */
    fetchItemsLimit?: number;
  }): Promise<TOut[]>;

  public getAnnotationFiltersFromEntity(
    entity: Entity,
    keys: JiraEntityFilters,
    options?: { projectFallback?: string },
  ): JiraEntityFilters {
    const annotations = entity?.metadata?.annotations || {};
    const projectValue =
      annotations[keys.project] ??
      (options?.projectFallback
        ? annotations[options.projectFallback]
        : undefined);

    if (!projectValue) {
      const requiredKeys = options?.projectFallback
        ? `'${keys.project}' or '${options.projectFallback}'`
        : `'${keys.project}'`;
      throw new Error(
        `Missing required ${requiredKeys} annotation for entity '${
          entity.metadata?.name || 'unknown'
        }'`,
      );
    }

    const projectAnnotationKey = annotations[keys.project]
      ? keys.project
      : options?.projectFallback ?? keys.project;

    const filters: JiraEntityFilters = {
      project: `project = "${validateJQLValue(
        sanitizeValue(projectValue),
        projectAnnotationKey,
      )}"`,
    };

    if (keys.component) {
      const component = annotations[keys.component];
      if (component) {
        filters.component = `component = "${validateJQLValue(
          sanitizeValue(component),
          keys.component,
        )}"`;
      }
    }

    if (keys.label) {
      const label = annotations[keys.label];
      if (label) {
        filters.label = `labels = "${validateJQLValue(
          sanitizeValue(label),
          keys.label,
        )}"`;
      }
    }

    if (keys.team) {
      const team = annotations[keys.team];
      if (team) {
        filters.team = `team = ${validateIdentifier(
          sanitizeValue(team),
          keys.team,
        )}`;
      }
    }

    if (keys.customFilter) {
      const customFilter = annotations[keys.customFilter];
      if (customFilter) {
        filters.customFilter = customFilter;
      }
    }

    return filters;
  }

  protected async getBaseUrl(): Promise<string> {
    const apiVersion = this.getApiVersion();
    return this.connectionStrategy.getBaseUrl(apiVersion);
  }

  protected async getAuthHeaders(): Promise<Record<string, string>> {
    return this.connectionStrategy.getAuthHeaders();
  }

  public async getCountOpenIssues(jql: string): Promise<number> {
    const baseUrl = await this.getBaseUrl();
    const countOpenIssuesUrl = `${baseUrl}${this.getSearchCountEndpoint()}`;
    const headers = await this.getAuthHeaders();

    const data = await this.sendRequest({
      method: 'POST',
      url: countOpenIssuesUrl,
      headers,
      body: this.buildSearchBody(jql),
    });

    return this.extractIssueCountFromResponse(data);
  }
}
