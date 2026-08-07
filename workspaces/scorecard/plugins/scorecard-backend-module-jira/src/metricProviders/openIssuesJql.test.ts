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

import type { JiraEntityFilters } from '../clients/types';
import { buildOpenIssuesJql } from './openIssuesJql';

describe('buildOpenIssuesJql', () => {
  const baseFilters: JiraEntityFilters = {
    project: 'project = "MOON"',
  };

  const openIssuesOptions = {
    mandatoryFilter: 'type = Task AND resolution = Resolved',
    customFilter: 'assignee = testerUser',
  };

  it('should use provided mandatory filter when mandatory filter is provided in options', () => {
    const jql = buildOpenIssuesJql(baseFilters, openIssuesOptions);
    const jqlFilters = jql.split(' AND ');

    expect(jqlFilters).toHaveLength(4);
    expect(jqlFilters).toContain('(project = "MOON")');
    expect(jql).toContain('(type = Task AND resolution = Resolved)');
    expect(jqlFilters).toContain('(assignee = testerUser)');
  });

  it('should use provided mandatory filter from options argument', () => {
    const jql = buildOpenIssuesJql(baseFilters, {
      mandatoryFilter: 'team = 4316',
    });
    expect(jql).toBe('(project = "MOON") AND (team = 4316)');
  });

  it('should use provided annotation custom filter when custom filter is provided in annotation and options', () => {
    const jql = buildOpenIssuesJql(
      {
        ...baseFilters,
        customFilter: 'assignee = Automobile',
      },
      openIssuesOptions,
    );
    const jqlFilters = jql.split(' AND ');

    expect(jqlFilters).toHaveLength(4);
    expect(jqlFilters).toContain('(project = "MOON")');
    expect(jqlFilters).toContain('(assignee = Automobile)');
    expect(jql).toContain('(type = Task AND resolution = Resolved)');
    expect(jql).not.toContain('(assignee = testerUser)');
  });

  it('should use provided annotation custom filter when custom filter is provided in annotation and not in options', () => {
    const jql = buildOpenIssuesJql(
      {
        ...baseFilters,
        customFilter: 'assignee = Robot',
      },
      { mandatoryFilter: 'resolution = Unresolved' },
    );
    expect(jql).toBe(
      '(project = "MOON") AND (assignee = Robot) AND (resolution = Unresolved)',
    );
  });

  it('should use provided options custom filter when custom filter is provided in options and not in annotation', () => {
    const jql = buildOpenIssuesJql(baseFilters, openIssuesOptions);
    const jqlFilters = jql.split(' AND ');

    expect(jqlFilters).toHaveLength(4);
    expect(jqlFilters).toContain('(project = "MOON")');
    expect(jqlFilters).toContain('(assignee = testerUser)');
  });

  it('should not use any custom filters when custom filter is not provided in annotation and options', () => {
    const jql = buildOpenIssuesJql(baseFilters, {});

    expect(jql).toBe(
      '(project = "MOON") AND (type = Bug AND resolution = Unresolved)',
    );
  });
});
