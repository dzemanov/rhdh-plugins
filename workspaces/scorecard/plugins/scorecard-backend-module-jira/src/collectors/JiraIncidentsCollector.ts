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
import type { Collector } from '@red-hat-developer-hub/backstage-plugin-scorecard-node';
import { z } from 'zod';
import { JiraClient } from '../clients/base';
import {
  incidentsCollectorInputSchema,
  incidentsCollectorOutputSchema,
} from './schemas/incidentsSchemas';

export class JiraIncidentsCollector
  implements
    Collector<
      (typeof JiraIncidentsCollector)['inputSchema'],
      (typeof JiraIncidentsCollector)['outputSchema']
    >
{
  static readonly inputSchema = incidentsCollectorInputSchema;
  static readonly outputSchema = incidentsCollectorOutputSchema;

  private readonly jiraClient: JiraClient;

  public constructor(jiraClient: JiraClient) {
    this.jiraClient = jiraClient;
  }

  getCollectorId(): string {
    return 'jira:incidents';
  }

  getCollectorDescription(): string {
    return 'Collects Jira incidents.';
  }

  getInputSchema() {
    return JiraIncidentsCollector.inputSchema;
  }

  getOutputSchema() {
    return JiraIncidentsCollector.outputSchema;
  }

  async collect(options: {
    entity: Entity;
    input: z.infer<(typeof JiraIncidentsCollector)['inputSchema']>;
  }): Promise<z.infer<(typeof JiraIncidentsCollector)['outputSchema']>> {
    const incidents = await this.jiraClient.getIncidentIssues(options.entity, {
      from: options.input.from,
      to: options.input.to,
    });

    return {
      incidents,
    };
  }
}
