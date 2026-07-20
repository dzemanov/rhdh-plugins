# DORA Median Lead Time for Changes

- **Metric ID**: `dora.medianLeadTimeForChanges`
- **Type**: Number
- **Unit**: hours
- **Computation window**: 30 days

The metric computes lead time for changes from pull request first commit timestamp to deployment timestamp, then returns the median.
Deployments are processed as chronological pairs (`previousDeployment` -> `currentDeployment`), and pull requests are resolved for the commit range between those two deployment SHAs. For each pull request in that range, lead time is calculated as `currentDeployment.createdAt - pullRequest.firstCommitAt`, and all collected lead times are used to compute the median.

## Scope and limitation

This metric assumes deployments form a single chronological stream for the entity. If deployments from multiple branches or release trains are mixed in the same stream, `previousDeployment` and `currentDeployment` can belong to different branches, which may produce incorrect lead-time pairing and noisy results.

## Default thresholds

Thresholds are applied to the computed value in hours:

- `elite`: `<24`
- `medium`: `24-168`
- `low`: `>168`

Configure thresholds via:

- `scorecard.plugins.dora.medianLeadTimeForChanges.thresholds`

## Collectors

DORA module uses [**collectors**](../../../scorecard-backend/docs/collectors.md) - reusable components designed to gather data from various datasources, such as Jira or GitHub. You can create your custom data collector to tailor data collection for your specific setup.

This metric requires two collectors: [Deployments collector](#deployments-collector) and [Pull requests between commits collector](#pull-requests-between-commits-collector).

### Deployments collector

Collects deployments.

Available deployment collectors:

- `github:deployments` (default)
- `github:deploymentWorkflowRuns`

For more information on the collectors above, see deployment collectors details in [scorecard-backend-module-github README](../../../scorecard-backend-module-github/README.md).

**Important:** These collectors, even the default one, require that you have `@red-hat-developer-hub/backstage-plugin-scorecard-backend-module-github` installed.

#### Deployments collector contract

If you're implementing a custom _Deployments_ collector, it must adhere to the following contract:

Required input:

- `from: string` (ISO datetime)
- `to: string` (ISO datetime)

Required output:

- `deployments: Array<{ id: string; commitSha: string; environment?: string; createdAt: string; result: 'success' | 'failure' | '' }>`

Ordering requirement:

- `deployments` must be in ascending `createdAt` order (oldest to newest). Order is required because the metric processes adjacent deployment pairs chronologically.

### Pull requests between commits collector

Collects pull requests included in the commit range between two deployments (`baseCommitSha` -> `headCommitSha`) and provides their first commit timestamps for lead-time calculation.

Available pull-request-range collectors:

- `github:deploymentRangePullRequests` (default)

For more information on the collector above, see collector details in [scorecard-backend-module-github README](../../../scorecard-backend-module-github/README.md).

**Important:** This collector requires that you have `@red-hat-developer-hub/backstage-plugin-scorecard-backend-module-github` installed.

#### Pull requests between commits collector contract

Required input:

- `baseCommitSha: string` (non-empty)
- `headCommitSha: string` (non-empty)

Required output:

- `pullRequests: Array<{ id: string; firstCommitAt: string }>`

`firstCommitAt` must be a valid ISO datetime for lead-time calculation.

Collector-specific extra input fields are allowed, but they do not replace required contract fields.

## Collector configuration

### Use default GitHub collectors

- Default, no need to provide configuration.

```yaml
scorecard:
  plugins:
    dora:
      medianLeadTimeForChanges:
        collectors:
          deployments:
            id: github:deployments
          deploymentRangePullRequests:
            id: github:deploymentRangePullRequests
```

### Use GitHub workflow runs for deployments

When using workflow runs as the deployments source, provide `workflowName` as extra collector input.

```yaml
scorecard:
  plugins:
    dora:
      medianLeadTimeForChanges:
        collectors:
          deployments:
            id: github:deploymentWorkflowRuns
            input:
              workflowName: deploy.yml
          deploymentRangePullRequests:
            id: github:deploymentRangePullRequests
```

### Use custom collectors

```yaml
scorecard:
  plugins:
    dora:
      medianLeadTimeForChanges:
        collectors:
          deployments:
            id: customDatasource:deployments
            input:
              # optional collector-specific extra input
          deploymentRangePullRequests:
            id: customDatasource:deploymentRangePullRequests
            input:
              # optional collector-specific extra input
```
