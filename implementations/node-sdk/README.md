# Experiences Node SDK reference implementation

This standalone Express/EJS implementation consumes `@contentful/experiences-node`
from locally built npm tarballs. It has its own dependencies, configuration, and
tooling, outside the root npm workspaces. It follows Optimization's Express/EJS
layout and request-facade pattern. An optional identify action and an owned page
operation precede concurrent Experience loading. `GET /health` makes no API calls.

## Request flow

`GET /` attempts one page event through `request.page()`, then fetches each
distinct configured Experience once, concurrently, reusing plans for repeated
presentations. `GET /?userId=charles` first calls `request.identify()` once with
that user ID and `traits: { identified: true }`. The SDK inherits locale, page and
user agent from the request context. Content selection waits for that operation
and uses the profile the SDK holds; identify is not attached to content fetches.
Refused or failed visitor events do not prevent valid content from rendering,
and page acceptance or profile presence is not a content eligibility check.
A fixed identify user ID is acceptable; it is distinct from the API-issued profile ID.

Profiles come only from Personalization API/XDA responses. The SDK owns the
profile on the request facade; concurrent content loads share established state. The app does not accept a profile-ID input,
persist profiles, or add cookies or sessions. Requests assume `consent: true`, like
the Optimization reference; this is not a consent-management implementation.

The page shows identify intent and renders the Experience content. A profile ID
does not confirm traits or audience membership, so that label does not assert a
confirmed identification result. Content or rendering exceptions
produce a short error response. The app does not inspect raw XDA responses;
application-level errors that the runtime does not surface remain an SDK limitation.
Responses are private/no-store and profiles remain request-local. The rate limiter
matches Optimization's 1000 requests per 30 seconds.

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

The earlier cleanup recorded user-reported fixes to XDA profile-only selection,
initial identification and full SDK-built event acceptance; those were deployment
premises, not new live observations. The user now explains the previously observed
GET failure for an XDA-created profile by forced preflight: the new ID was
provisional and a later profile-only XDA request internally used XPAPI GET, yielding
404 for the uncommitted ID. The SDK-to-XDA request can still be POST. The separate
`context.page.title` 422 remains unresolved.

Event-bearing XDA always invokes XPAPI with `preflight: true`, without an override,
and commits neither events nor profile creation/changes. New IDs are provisional;
an existing concrete ID can remain concrete while previewed changes stay uncommitted.
See [XDA preflight and profile finalization](../../packages/runtime/README.md#xda-preflight-and-profile-finalization).
This app uses ordinary committing XPAPI identify/page actions before profile-only
content and does not exercise replay. Independent reads with an already-concrete
profile remain viable. The SDK currently auto-adopts returned IDs; adoption is not
finalization. Ordinary committing XPAPI identify/page/track or successful browser
replay finalizes; hydration, localStorage and cookies do not. Personalization API
preflight and prepared handoff/replay remain supported.

Retain final transformed-event validation, consent metadata and caller-input
immutability in the SDK. Await an identity operation when later selection needs
its evaluated result; admission, `identityReady`, flush resolution or generic SDK
success alone does not prove a commit.
Only serialize content requests with an actual dependency on a preceding result.
The configured distinct loads here share established request state and are
independent; repeated presentations reuse the same plan.

Live validation must inspect delivered variants and personalization outcomes;
HTTP 200 or profile presence alone is insufficient. The render plan does not
expose all raw XDA personalization errors. Keep direct API diagnosis outside the
app rather than adding response interception to its runtime flow. The SDK's
required-`userId` return type on `buildIdentify()` remains a typing contract.

## Rendering and differences from Optimization

The EJS shell uses Optimization's CSS, including its font stack, 1040px width,
spacing, centered gray panels, and fixed 75dvh rows. Branding and the Experiences
section label reflect this SDK. The States link requests one identify action on
the next request. XDA selects Experience content using the established SDK profile
after the ordinary Personalization operations.

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
- [Local package artifacts](../../README.md#local-npm-artifacts)
