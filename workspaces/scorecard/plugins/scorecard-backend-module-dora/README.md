# Scorecard Backend Module for DORA

This is an extension module to the `backstage-plugin-scorecard-backend` plugin that provides DORA (DevOps Research and Assessment) metrics – key indicators of software delivery performance.

DORA module uses [**collectors**](../scorecard-backend/docs/collectors.md) – reusable components designed to gather data from various datasources, such as Jira or GitHub. You can create your custom data collector to tailor data collection for DORA metrics calculation for your specific setup.

## Prerequisites

Before installing this module, ensure that the Scorecard backend plugin is integrated into your Backstage instance. Follow the [Scorecard backend plugin README](../scorecard-backend/README.md) for setup instructions.

If you use built-in collectors from GitHub and Jira modules, install the corresponding backend modules so those collectors are registered:

- `@red-hat-developer-hub/backstage-plugin-scorecard-backend-module-github`
- `@red-hat-developer-hub/backstage-plugin-scorecard-backend-module-jira`

## Installation

To install this backend module:

```bash
# From your root directory
yarn workspace backend add @red-hat-developer-hub/backstage-plugin-scorecard-backend-module-dora
```

```ts
// packages/backend/src/index.ts
import { createBackend } from '@backstage/backend-defaults';

const backend = createBackend();

backend.add(
  import('@red-hat-developer-hub/backstage-plugin-scorecard-backend'),
);

backend.add(
  import(
    '@red-hat-developer-hub/backstage-plugin-scorecard-backend-module-dora'
  ),
);

backend.start();
```

### Entity annotations

DORA metric providers run only for entities that include:

```yaml
metadata:
  annotations:
    scorecard.io/dora: 'true'
```

## Available Metrics

- `dora.deploymentFrequency`: [details](./docs/metrics/deployment-frequency.md)
- `dora.medianLeadTimeForChanges`: [details](./docs/metrics/median-lead-time-for-changes.md)

## Use your own collectors

You can replace default collector IDs via `app-config.yaml` as long as your collectors implement the schema contracts expected by each metric:

- `dora.deploymentFrequency` [collector contracts](./docs/metrics/deployment-frequency.md#collectors)
- `dora.medianLeadTimeForChanges` [collector contracts](./docs/metrics/median-lead-time-for-changes.md#collectors)

Collector inputs are merged with provider-generated required inputs. This lets you pass extra collector-specific fields (for example `workflowName` when using a workflow-runs based collector) as long as required contract fields are still supported.

```yaml
scorecard:
  plugins:
    dora:
      deploymentFrequency:
        collectors:
          deployments:
            id: customDatasource:deployments
            input:
              # merged with generated from/to window
              # your collector-specific options
      medianLeadTimeForChanges:
        collectors:
          deployments:
            id: customDatasource:deployments
            input:
              # merged with generated from/to window
          deploymentRangePullRequests:
            id: customDatasource:deploymentRangePullRequests
            input:
              # merged with generated baseCommitSha/headCommitSha
```

## Scheduling

DORA providers follow Scorecard scheduling settings under their metric keys:

- `scorecard.plugins.dora.deploymentFrequency.schedule`
- `scorecard.plugins.dora.medianLeadTimeForChanges.schedule`

See [providers.md](../scorecard-backend/docs/providers.md#metric-collection-scheduling) for schedule schema and defaults.
