# Experiences Node SDK reference implementation

**Current Phase 6 correction:** Complete and explicitly accepted on 2026-11-02; current checks and acceptance review are recorded in the implementation plan. Phase 7 is complete and explicitly accepted on 2026-11-02, including its API refinements and simplification. Phase 8 is in progress; phases 9–13 have not started; the Phase 6 gate is satisfied. Earlier remedy checks and no-production-findings review are historical evidence for a superseded design; no new live-service validation is claimed.

This standalone Express/EJS implementation consumes `@contentful/experiences-node`
from locally built npm tarballs. It has its own dependencies, configuration, and
tooling, outside the root npm workspaces. It follows Optimization's Express/EJS
layout and request-facade pattern. It builds optional identify and one page into
XDA evaluation through ordinary Node fetch and renders available plans. This SSR
flow does not commit XDA-carried events. `GET /health` makes no API calls.

## Request flow

`GET /` supplies `{ type: 'page' }` in `personalization.events`.
`GET /?userId=charles` also supplies identify arguments with that user ID and
`traits: { identified: true }`; the owner builds admitted intent once. The SDK inherits locale, page and
user agent from request context. No direct `request.identify()` / `request.page()`
is required before rendering. Ordinary `request.fetchExperience` builds admitted
type-tagged arguments once, also accepting raw built XDA events. XDA evaluates with
XPAPI preflight and returns a selected plan and locally adopted profile ID.
This Node-only app creates no handoff and performs no aggregate commit.

The lightweight best-effort loop compares distinct configured Experiences only.
Later IDs and same-ID content Retry use ordinary fetch without events, builders,
event hooks or replay. Reuse plans for repeated presentations. Official support
is one Experience per page, unenforced in code; this loop supplies no
multi-Experience or cross-fetch guarantee. See
[Runtime's XDA contract](../../packages/runtime/README.md#xda-preflight-and-profile-finalization).

Profiles come only from Personalization API/XDA responses and remain owned by the
request facade. The app accepts no manual profile input and adds no persistence,
cookies or sessions. Requests assume `consent: true`, like the Optimization
reference; this is not a consent-management implementation. A fixed identify user
ID is demonstration intent, distinct from the API-issued profile ID.

The page shows identify intent and renders Experience content. Fetch results retain
the full profile, but the label describes application intent rather than interpreting
its traits or asserting confirmed identification. Content or rendering exceptions produce
a short error response. The app does not inspect raw XDA responses; application-level
errors the runtime does not surface remain an SDK limitation. Responses are
private/no-store and profiles remain request-local. The rate limiter matches
Optimization's 1000 requests per 30 seconds.

## Optional Preview Session snapshots

Configure the existing local `.env`:

```dotenv
LIVE_PREVIEW_ENABLED=true
PREVIEW_TOKEN=<server-only preview token>
# PREVIEW_HOST=https://...          # optional snapshot endpoint
```

Visit `/?preview_session_id=<session>`; optional `preview_experience_id` selects
any Experience ID (default: first presentation ID). The binding can also come from
`LIVE_PREVIEW_SESSION_ID` / `LIVE_PREVIEW_EXPERIENCE_ID`; optional
`LIVE_PREVIEW_RESOURCE_RESOLUTION` is forwarded. An explicit empty
`preview_session_id` leaves preview, including when a default session is configured.
The presentation ID list stays unchanged; other IDs use Delivery.
`forRequest({ livePreview })` imports the installed optional package, skips
page/identify work and fetches the snapshot through the normal renderer.
`request.destroy()` runs in `finally`. Reload for another snapshot.
See [Runtime preview limits](../../packages/runtime/README.md#shared-limitations).

## Personalization contract and validation limits

Event-bearing XDA always invokes XPAPI with `preflight: true`, without an override,
and commits neither events nor profile creation/changes. New IDs are provisional;
an existing concrete ID can remain concrete while previewed changes stay uncommitted.
Profile-only XDA internally uses XPAPI GET, returning 404 for an uncommitted ID even
when the SDK-to-XDA request is POST. SDK local adoption is not finalization. See
[XDA preflight and profile finalization](../../packages/runtime/README.md#xda-preflight-and-profile-finalization).

SSR XDA-carried events remain uncommitted as a tolerated service bug awaiting
upstream force-commit support. There is no current force flag or SDK workaround.
Direct event APIs remain callable without becoming an initial rendering prerequisite
or compensation. Preserve transformed-event validation, consent metadata and
caller-input immutability. Local adoption and storage do not prove upstream commit.

The current service's observed `context.page.title` 422 remains unresolved. Keep
built titles and consent context intact; do not strip them or add a prior-page
workaround. Live validation must inspect delivered variants and personalization
outcomes; HTTP 200 or profile presence alone is insufficient. Plans do not expose
all raw XDA personalization errors. Keep direct API diagnosis outside the app
rather than adding response interception. The SDK's required-`userId` return type
on `buildIdentify()` remains a typing contract.

## Rendering and differences from Optimization

The EJS shell uses Optimization's CSS, including its font stack, 1040px width,
spacing, centered gray panels, and fixed 75dvh rows. Branding and the Experiences
section label reflect this SDK. The States link requests one identify action on
the next request. XDA selects Experience content from the embedded built events
and chained SDK-owned profile ID during preflight evaluation.

Experiences returns nested plans instead of CDA entries. The recursive `nodes.ejs` partial
renders this space's `title`, plain `text`, `richText.document`, and slot children.
The data assemblies map the `content` entry's `internalTitle` to `title`, pass
through `text`, and wrap the Rich Text JSON in `richText.document`. Both delivered
node types use those same fields; the current bindings have no collection output.
The Coded Experience has one `codedExperienceTemplate` node with two
`codedComponent` nodes in its `slot`. The Composed Experience expands into five
`codedComponent` nodes: two from its template, two from its composed fragment,
and one personalized fragment. These two Experiences include that personalized
fragment, configured to replace baseline content with variant content for the
Identified Users audience.
The Personalized Composed Experience expands into two `codedComponent` nodes with
no slot content. Its baseline displays Content 1 followed by Content 2; its
Experience variant reverses that order for the Identified Users audience.
The SDK owns resolution; the template uses its resolved props and does not look up
the management export. Rich Text documents are passed directly to Contentful's
HTML renderer at the same version Optimization uses. Text and attributes use
ordinary EJS escaping. There is no diagnostic UI or custom Rich Text handling.

The existing `npm run mocks:generate:ctfl:types` command generates declarations
from the local space export and copies them to `src/contentful-generated.d.ts`.
Do not edit that copy. Its current output describes CDA entries, not the Experience
component/template properties, so those declarations are not imported by this app.
The app uses the SDK's `PortableRenderPlan` type; no local content interfaces are
maintained. The installed generator is 3.0.1 and produces only CDA declarations;
running it requires Node 24 or later. Custom Experience type generation is outside this task’s scope.

## Prerequisites

- Node.js 24 or later for repository tooling, including content-type generation.
  The standalone app declares Node.js 22.13 or later. Validation uses Node 24.15
  and npm 12.0.2.
- The repository's root dependencies installed with `npm ci`.

## Setup

Run from the repository root:

```sh
npx nx run implementation-node-sdk:setup
```

Nx builds, checks, and packs the Node SDK's local dependency chain and packs the
optional preview package through `package-tools:pack-preview`, then installs
this app's dependencies and prepares the local environment file. Installation uses npm with
workspace participation, lifecycle scripts, and package-lock generation disabled.
It removes only this app's `node_modules` before installing, so rebuilt tarballs
are refreshed even when their names and versions are unchanged. This follows
Optimization's fresh local-artifact install workflow using npm and Nx.

Setup creates `.env` from `.env.example` only when the file is missing. Populate
this implementation's `.env` with `SPACE_ID`, `ENVIRONMENT_ID`, and `CDA_TOKEN`.
Set `LOCALE` if different from `en-US`.
Workers may gather these values from `lib/mocks/.contentfulrc.json` and
`lib/mocks/.env` during setup. The app and its launch commands use only the local
`.env`; they never read those source files. Do not copy the management token.
Keep real credentials out of `.env.example` and Git.

The default Experience IDs are fixed in source, matching Optimization's approach
and shared by all reference implementations:

- `3fLAdFb3BYAuImRhcW8k4t` — Coded Experience
- `4WzbgzPQHa9Tr2ffbOU8p7` — Composed Experience
- `7u2eP09B4BIBToH8UwSHck` — Personalized Composed Experience

Optionally set comma-separated `EXPERIENCE_IDS` in this implementation's `.env`
to replace that list. An absent or blank value uses the defaults. These are
content IDs; profile IDs continue to come only from the APIs through the SDK.

After SDK changes, refresh the installed artifacts:

```sh
npx nx run implementation-node-sdk:install
```

Existing `.env` values are preserved. Direct third-party dependencies are pinned;
transitive registry dependencies are resolved on each install, so this development
workflow does not provide lockfile-level reproducibility. npm may generate installation metadata inside `node_modules`; no lockfile is committed for this app.

## Running locally

```sh
npx nx run implementation-node-sdk:dev         # foreground; Ctrl-C stops it
npx nx run implementation-node-sdk:serve       # PM2 background process
npx nx run implementation-node-sdk:status
npx nx run implementation-node-sdk:logs -- --lines 20 --nostream
npx nx run implementation-node-sdk:restart
npx nx run implementation-node-sdk:serve:stop  # deletes only this app's process
```

The default app URL is `http://localhost:3100/`; health is at `/health`. Set `PORT` in the local
`.env` to change it. Both launch paths load that same file. The server binds to
loopback. PM2 uses the name `experiences-node-sdk-app`. Run only one checkout with
that process name at a time. Stop deletes that named process; PM2 reports an error
if it is already absent. Status, logs, and stop use the installed PM2 CLI directly.

These commands use the app's local tools. No mock server or E2E tooling is started
or installed. Running from the app directory is also supported, for example
`npm run dev` or `npm run typecheck`.

The repository also provides `npm run pm2:list`, `npm run pm2:logs`,
`npm run pm2:stop:all`, and `npm run pm2:delete:all`, matching Optimization.
These operate on the selected PM2 home; the `all` commands affect every process
there. Use `implementation-node-sdk:serve:stop` to stop only this app.

## Validation and cleanup

```sh
npx nx run implementation-node-sdk:typecheck
npx nx run implementation-node-sdk:lint
npx nx run implementation-node-sdk:clean
```

The app uses ordinary package scripts for its local tools, with Nx coordinating
them. There are no implementation-owned runner or verification scripts. Isolation
is demonstrated by installing and running a copy outside the repository.

`clean` removes only `dist` and `coverage`; it preserves `.env`, dependencies, and
processes. Root build/test/lint/typecheck commands exclude implementations, so a
root-only install does not require this app to be set up. Use Nx selection for
implementation-wide work:

```sh
npx nx run-many -t setup --projects=tag:scope:implementation
npx nx run-many -t typecheck,lint --projects=tag:scope:implementation
```

## Troubleshooting

- Missing installation or an outdated archive: run the root `setup` command.
- Missing local `.env`: copy `.env.example`, then populate the local settings.
- A port conflict: choose another `PORT`; do not stop unrelated processes.
- For a copy outside the repository, preserve the relative archive layout:
  `implementations/node-sdk` and `pkgs` under a common directory. Install with
  `npm install --workspaces=false --package-lock=false --ignore-scripts` inside the
  copied app, then use its local npm scripts. Nx and root dependencies are not
  required to run or check that configured copy.

## Related

- [Node SDK](../../packages/node/README.md)
- [Local package artifacts](../../CONTRIBUTING.md#local-npm-artifacts)
