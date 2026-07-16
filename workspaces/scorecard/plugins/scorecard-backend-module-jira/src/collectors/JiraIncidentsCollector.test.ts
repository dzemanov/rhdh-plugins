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

import { JiraClient } from '../clients/base';
import { JiraIncidentsCollector } from './JiraIncidentsCollector';

describe('JiraIncidentsCollector', () => {
  it('collects incidents from Jira client', async () => {
    const getIncidentIssues = jest.fn().mockResolvedValue([
      {
        id: 'INC-100',
        createdAt: '2026-06-01T10:00:00.000Z',
        resolutionDate: '2026-06-01T12:00:00.000Z',
      },
    ]);
    const mockedJiraClient = {
      getIncidentIssues,
    } as unknown as jest.Mocked<JiraClient>;
    const collector = new JiraIncidentsCollector(mockedJiraClient);

    const result = await collector.collect({
      entity: {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'service-a',
          annotations: {
            'jira/incident-project-key': 'INC',
            'jira/project-key': 'PROJ',
          },
        },
      },
      input: {
        from: '2026-06-01T00:00:00.000Z',
        to: '2026-06-30T23:59:59.999Z',
      },
    });

    expect(result).toEqual({
      incidents: [
        {
          id: 'INC-100',
          createdAt: '2026-06-01T10:00:00.000Z',
          resolutionDate: '2026-06-01T12:00:00.000Z',
        },
      ],
    });
    expect(getIncidentIssues).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          annotations: expect.objectContaining({
            'jira/incident-project-key': 'INC',
          }),
        }),
      }),
      expect.objectContaining({
        from: '2026-06-01T00:00:00.000Z',
        to: '2026-06-30T23:59:59.999Z',
      }),
    );
  });
});
