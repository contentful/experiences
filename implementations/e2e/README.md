# Reference implementation live E2E checks

Opt-in Playwright checks that drive the five maintained reference implementations
against live Contentful services and the seeded reference Destination. They are a
maintainer tool, not a customer example and not part of any default validation:
they never run in the root `build`/`test`/`lint`/`typecheck` scripts, in
`implementation:install`, or in the CI "Check reference implementations" step. The
project is tagged `scope:e2e` (not `scope:implementation`) and exposes only
`e2e-install`, `e2e-typecheck` and `e2e` targets.

## What is covered

| Reference          | Workflow                      | Checks                                                                                                                                                 |
| ------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `node-sdk`         | Node SSR                      | Content by path and node, `302` redirect, `404` for a missing path, by-ID home regression                                                              |
| `web-sdk`          | Web CSR                       | Content by path and node, one page event in the by-path XDA fetch, event-free node fetch, explicit redirect, not-found, home                           |
| `node-sdk+web-sdk` | Node SSR + Web hybrid         | One replayed page and no browser XDA at startup, event-free Retry, `302` redirect without handoff, `404` with replay kept, home                        |
| `react-sdk`        | React managed CSR             | Content by path and node, one page event, event-free Retry, app-handled redirect, not-found, home                                                      |
| `nextjs-sdk`       | App and Pages, SSR and hybrid | Content by path and node, no startup browser XDA, one replayed page (hybrid) or none (SSR), `307` redirect, `404`, client navigation, by-ID regression |

Page events are counted from outgoing browser requests (XDA Delivery bodies and
Personalization API batches). Request bodies are inspected only for event types and
nothing is logged.

## Configuration

Each app reads its own ignored `implementations/<app>/.env`. A spec runs only when
that file sets `SPACE_ID`, `CDA_TOKEN` and `DESTINATION_ID`; otherwise it is skipped
with a message naming the missing keys. Use credentials for the "Experiences SDK CI"
space and the Destination created by `npm run mocks:seed:ctfl:destination` (see
[`lib/mocks`](../../lib/mocks/README.md#reference-destination)). The other
`DESTINATION_*` settings default to the seeded fixture: `/getting-started`, node
`spring-offers`, redirect `/quick-start` and missing `/retired-page`. Next.js also
needs `BROWSER_CDA_TOKEN`. Never put the management token in an app `.env`.

## Run

```sh
npm run implementation:install                  # pack the SDKs and set up all five references
npx nx run implementation-e2e:e2e-install       # local Playwright and Chromium, outside npm workspaces
npx nx run implementation-e2e:e2e               # or: npm run implementation:e2e
npx nx run implementation-e2e:e2e -- --project=nextjs-sdk
```

Playwright starts each configured app with its own `dev`/`start` command on its fixed
port (3100–3500) and stops it afterwards; an app already running on its port is reused.
Run after `implementation:install` so the apps use freshly packed SDK artifacts. The
checks are live and serial; transient upstream failures are real failures to inspect,
not to retry automatically.
