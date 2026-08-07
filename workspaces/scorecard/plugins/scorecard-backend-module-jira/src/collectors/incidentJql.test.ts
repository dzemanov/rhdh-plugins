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

import { ScorecardJiraIncidentAnnotations } from '../annotations';
import { newEntityComponent } from '../../__fixtures__/testUtils';
import { buildIncidentJql } from './incidentJql';

const { INCIDENT_ISSUE_TYPE } = ScorecardJiraIncidentAnnotations;

describe('buildIncidentJql', () => {
  const options = {
    from: '2026-06-01T00:00:00.000Z',
    to: '2026-06-30T23:59:59.999Z',
  };

  it('should build JQL using filters and date bounds', () => {
    const entity = newEntityComponent();
    const jql = buildIncidentJql(
      { project: 'project = "INC"' },
      options,
      entity,
    );

    expect(jql).toBe(
      '(project = "INC") AND (type = "Incident") AND (created >= "2026-06-01 00:00") AND (created <= "2026-06-30 23:59")',
    );
  });

  it('should include optional incident filters in JQL', () => {
    const entity = newEntityComponent();
    const jql = buildIncidentJql(
      {
        project: 'project = "INC"',
        component: 'component = "Payments"',
        label: 'labels = "sev-1"',
      },
      options,
      entity,
    );

    expect(jql).toBe(
      '(project = "INC") AND (component = "Payments") AND (labels = "sev-1") AND (type = "Incident") AND (created >= "2026-06-01 00:00") AND (created <= "2026-06-30 23:59")',
    );
  });

  it('should use incident issue type from entity annotation', () => {
    const entity = newEntityComponent({
      [INCIDENT_ISSUE_TYPE]: 'Production Incident',
    });

    const jql = buildIncidentJql(
      { project: 'project = "INC"' },
      options,
      entity,
    );

    expect(jql).toContain('(type = "Production Incident")');
  });

  it('should use configured issue type when annotation is not set', () => {
    const entity = newEntityComponent();

    const jql = buildIncidentJql(
      { project: 'project = "INC"' },
      { ...options, issueType: 'Service Incident' },
      entity,
    );

    expect(jql).toContain('(type = "Service Incident")');
  });

  it('should prefer entity annotation issue type over configured issue type', () => {
    const entity = newEntityComponent({
      [INCIDENT_ISSUE_TYPE]: 'Production Incident',
    });

    const jql = buildIncidentJql(
      { project: 'project = "INC"' },
      { ...options, issueType: 'Service Incident' },
      entity,
    );

    expect(jql).toContain('(type = "Production Incident")');
    expect(jql).not.toContain('(type = "Service Incident")');
  });
});
