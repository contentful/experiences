# Experiences Node SDK reference implementation

This standalone Express/EJS implementation consumes `@contentful/experiences-node`
from locally built npm tarballs. It has its own dependencies, configuration, and
tooling, outside the root npm workspaces. It follows Optimization's Express/EJS
layout and request-facade pattern. It builds optional identify and one page into
XDA evaluation through ordinary Node fetch and renders available plans. This SSR
flow commits admitted XDA-carried intent through ordinary fetch. `GET /health` makes no API calls.

## Request flow

`GET /` supplies `{ type: 'page' }` in `personalization.events`.
`GET /?userId=charles` also supplies identify arguments with that user ID and
`traits: { identified: true }`; the owner builds admitted intent once. The SDK inherits locale, page and
user agent from request context. No direct `request.identify()` / `request.page()`
is required before rendering. Ordinary `request.fetchExperience` builds admitted
type-tagged arguments once, also accepting raw built XDA events. XDA evaluates with
`personalization.preflight: false` by default, committing admitted intent and returning
a selected plan and locally adopted profile ID.
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

## Destinations

`GET /destination?path=/getting-started` resolves one Destination path through the request
facade's ordinary `request.fetchByDestinationPath`, then the configured node through
`request.fetchByDestinationNode`. Absent `path` uses `DESTINATION_PATH`. The by-path
primary carries this request's page and optional `?userId=charles` identify arguments
in `personalization.events`, exactly like the first by-ID fetch on `/`; the by-node
comparison is an ordinary event-free fetch with the returned profile ID. Destinations
are space-scoped, so the route passes no locale, parameters or extensions. They have
no native preview, so the route configures no Preview Session.

- **Redirect**: `isDestinationRedirect(result)` narrows `{ redirect: { path } }`, and the
  app answers `302` to `/destination?path=<target>`, retaining other query intent.
  A redirect is never rendered as content. A redirecting by-node comparison shows a
  link to its target instead of content.
- **Not found**: a missing path rejects with `NotFoundError`; the existing error handler
  answers `404`.
- Each rendered plan reports the Experience it served through `plan.experienceId`
  (`data-experience-id`). The first page of `sdk.fetchDestinationSitemap` links the
  Destination's paths; a sitemap failure only omits those links.

Configure the existing local `.env`:

| Setting                     | Default            | Meaning                                 |
| --------------------------- | ------------------ | --------------------------------------- |
| `DESTINATION_ID`            | none               | Enables the route content when nonblank |
| `DESTINATION_PATH`          | `/getting-started` | Path rendered when `?path=` is absent   |
| `DESTINATION_NODE_ID`       | `spring-offers`    | By-node comparison                      |
| `DESTINATION_REDIRECT_PATH` | `/quick-start`     | Utilities redirect example link         |
| `DESTINATION_MISSING_PATH`  | `/retired-page`    | Utilities not-found example link        |

Without `DESTINATION_ID`, startup and `/` are unchanged and `/destination` reports
that the Destination is not configured. The Destination id is created by the
`lib/mocks` Destination seed for the "Experiences SDK CI" space; copy it into this
app's `.env`. Typecheck and lint cover this route; it has not been verified against
the live Destination. Whether the Destinations API evaluates or commits the page
intent carried by a request that resolves to a redirect is not verified; the
redirect target request carries its own page.

## Optional Preview Session snapshots

Configure the existing local `.env`:

```dotenv
LIVE_PREVIEW_ENABLED=true
PREVIEW_TOKEN=<server-only preview token>
# PREVIEW_HOST=https://...          # optional snapshot endpoint
```

Visit `/?preview_session_id=<session>`. Session content is used only for the
Experience ID carried by the returned payload.
Preview activates only when app-local `LIVE_PREVIEW_ENABLED` is exactly `true` and
the URL supplies a nonempty, trimmed `preview_session_id`. `LIVE_PREVIEW_SESSION_ID`
is local convenience storage only; runtime/build code never reads it.
The preview flag is read from the local file on each launch, including PM2 restart,
so an older inherited environment value cannot keep preview enabled.
Missing or empty session parameters, or a disabled flag even with a session URL,
use ordinary mode and events. Optional `LIVE_PREVIEW_RESOURCE_RESOLUTION` is forwarded.
The presentation ID list stays unchanged; other IDs use Delivery.
`forRequest({ preview })` supplies the URL session on the request; configured Preview
transport plus a nonempty session determines `request.isPreview`. Active preview skips page/identify work and fetches
the snapshot with the configured Preview transport through ordinary
`fetchExperience`. Node opens no socket and needs no live-update client.
`request.destroy()` runs in `finally`. Reload for another snapshot.
See [Runtime preview limits](../../packages/runtime/README.md#shared-limitations).

## Personalization contract and validation limits

XDA defaults to `preflight: true`, which evaluates without committing events or
profile creation/changes. The SDK explicitly defaults supplied personalization to
`preflight: false` for ordinary fetches, so this SSR reference commits admitted intent.
Node `forRequest({ preflight })` supplies a request default; an explicit per-call
`personalization.preflight` wins. Explicit true keeps new IDs provisional and
changes uncommitted.
Profile-only XDA internally uses Personalization API GET, returning 404 for an uncommitted ID even
when the SDK-to-XDA request is POST. SDK local adoption is not finalization. See
[XDA preflight and profile finalization](../../packages/runtime/README.md#xda-preflight-and-profile-finalization).

This Node-only reference uses the ordinary committed path and creates no browser
replay. Actual hybrid producers instead pin preflight true and reject explicit false.
Direct event APIs remain callable without becoming an initial rendering prerequisite
or compensation. Preserve transformed-event validation, consent metadata and
caller-input immutability. Local adoption and storage do not prove upstream commit.

Keep built titles and consent context intact. Live validation must inspect
delivered variants and personalization
outcomes; HTTP 200 or profile presence alone is insufficient. Plans do not expose
all raw XDA personalization errors. Keep direct API diagnosis outside the app
rather than adding response interception. The SDK's required-`userId` return type
on `buildIdentify()` remains a typing contract.

## Rendering and differences from Optimization

The EJS shell uses Optimization's CSS, including its font stack, 1040px width,
spacing, centered gray panels, and fixed 75dvh rows. Branding and the Experiences
section label reflect this SDK. The States link requests one identify action on
the next request. XDA selects Experience content from the embedded built events
and chained SDK-owned profile ID during evaluation.

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
running it requires Node 24 or later. Custom Experience type generation is not included in this reference.

## Prerequisites

- Node.js 24 or later for repository tooling, including content-type generation.
  The standalone app declares Node.js 22.13 or later.
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
them. There are no implementation-owned runner or verification scripts. To verify
isolation, install and run a copy outside the repository.

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

## Live E2E checks

The opt-in [reference E2E suite](../e2e/README.md) drives this app against live services
and the seeded reference Destination. It needs `SPACE_ID`, `CDA_TOKEN` and `DESTINATION_ID`
in this app's `.env` and runs only on request:
`npx nx run implementation-e2e:e2e -- --project=node-sdk`. It is not part of this app's
`build`, `lint` or `typecheck` targets and adds nothing to the app itself.
