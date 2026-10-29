# Experiences Node + Web SDK reference implementation

This standalone Express/EJS application consumes locally packed public
`@contentful/experiences-node` and `@contentful/experiences-web` packages. It has its
own dependencies and tools and stays outside root npm workspaces.

Home and Page Two render actual Experience
content as ordinary HTML, including named slots and Rich Text, with JavaScript
disabled. With JavaScript enabled, one Web SDK adopts the final server profile and
observes the existing HTML without a startup content fetch or page event. Utilities
shows activation/profile availability and both consent decisions, with paired
Grant/Revoke, Identify, Reset and Retry content controls. Client navigation and
back/forward fetch and render through the same Web SDK; Page Two also has a separate
custom-event action. The optional sidebar displays browser event attempts.
`/health` checks local process liveness only; it makes
no API calls and does not establish upstream readiness.

## Server request flow

One process-level Node SDK creates a request facade with explicit locale, page
URL/path/query/referrer, user agent, consent and permitted incoming identity. The
handler submits `request.identify()` once only when `?userId=charles` requests
that intent, using `traits: { identified: true }` and the request's context.
It awaits that identity operation, then attempts the owned
`request.page({ properties: page })`. Refused or failed visitor events leave
otherwise valid content eligible; neither acceptance nor profile presence gates
loading. Independent distinct content fetches run concurrently using the SDK's
established profile, without embedded identify or page events.

Home fetches all configured IDs and reuses the first plan for its manual
presentation. Page Two fetches the last ID for its automatic presentation and the
first for its manual presentation. Matching IDs are fetched once per response.
Each ordinary server Delivery fetch requests `extensions: { sourceMap: {} }`;
all fetches use empty SDK resolver registries. The EJS renderer distinguishes coded Component and Experience Template
registrations, follows actual named slots, and merges `design < content < resolved
< slots` (no registration defaults are configured). Plain values and attributes
use EJS escaping; Rich Text uses Contentful's HTML renderer directly. The server
does not read management exports or maintain duplicate content schemas.

Automatic plan containers and node roots use the public Web tracking-attributes
helper. Manual roots instead carry only their real innermost attribution as
attribute-escaped `data-reference-view-attribution` JSON. Repeated presentations
have separate DOM boundaries. Automatic tracking observes the existing SSR HTML
from SDK construction; manual roots are registered before state hydration. Browser
activation uses the existing SDK detectors; the application adds no interaction
observer.

After this response’s content fetches settle, public Node
`createRequestHandoffFromData()` packages final `request.profile` into a private-request, state-only handoff. For ordinary requests, the non-executable
`experience-bootstrap` JSON script contains exactly `{ environment, handoff }`;
serialization escapes `<` as `\u003c`. It contains no replay, content plans,
delivery diagnostics, server event journal or private server settings. Responses
use `Cache-Control: private, no-store`. Do not log, save or cache live handoffs.

Recognized `plan.deliveryDiagnostics` preserve useful content and produce only a
generic warning/count. Upstream `fieldPath`/`message` strings may contain private
data and are never automatically shown, logged or serialized. This is distinct
from local `plan.diagnostics` and thrown errors; an absent warning does not prove
personalization success. Missing Experiences produce a generic 404; other
service/render failures produce a generic 502 without exposing response details.
Empty plans retain their own empty-content message.

## Optional runtime Live Preview

Configure the existing local `.env` and run `npm run dev` after setup:

```dotenv
LIVE_PREVIEW_ENABLED=true
PREVIEW_TOKEN=<server-only preview token>
BROWSER_PREVIEW_TOKEN=<preview token approved for browser exposure>
# BROWSER_PREVIEW_HOST=https://...  # optional browser snapshot endpoint
# LIVE_PREVIEW_SESSION_HOST=wss://... # optional socket endpoint
```

Use `?preview_session_id=<session>` and optional `preview_experience_id` (any
Experience ID, default: first presentation ID), or configure
`LIVE_PREVIEW_SESSION_ID` / `LIVE_PREVIEW_EXPERIENCE_ID`. Optional
`LIVE_PREVIEW_RESOURCE_RESOLUTION` is forwarded. Other IDs use Delivery. Optional `PREVIEW_HOST` sets the server snapshot endpoint.
Node uses request-local `livePreview` and `request.destroy()`. Web retains SSR
markup and serialized `initialPlans`, then attaches `subscribeToPreview()` without
a startup fetch, page event or visitor handoff. Navigation and Retry use
`fetchExperience()` before attaching listeners; `states.preview` exposes connection status.
Preview skips visitor initialization and disables Identify. Navigation inherits
the current binding only when the destination omits it; explicit destination
preview parameters take precedence. Binding changes within preview use
`replaceLivePreview`; entering or leaving preview reloads the document to create
a new SDK owner. An explicit empty `preview_session_id` leaves preview, including
when a default session is configured. The presentation ID list stays unchanged.
Ordinary `build`, `dev`, `serve`, and `restart` commands read app-local
`LIVE_PREVIEW_ENABLED`: `true` includes optional preview assets and enables host
configuration; other values exclude them. Rebuild after changing this deployment
setting. Only explicit browser preview settings enter HTML. Preview errors retain
usable content, replace failed loading placeholders, and offer Retry content;
successful updates clear recovered errors. Initial plans with diagnostics retain
usable content and show a generic error.
See [Runtime preview limits](../../packages/runtime/README.md#shared-limitations).

## Server consent and identity

The host decodes separate `experiences-hybrid-event-consent` and
`experiences-hybrid-persistence-consent` cookies: `granted` is true, `denied` is
false, and missing/unrecognized is undecided. It passes both independently to the
request facade. Only explicitly granted persistence permits reading the
SDK identity cookie (`ctfl-opt-aid`) into the request. A cookie's presence does not
establish consent. The SDK owns profile creation and updates; the app has no
profile store or manual profile input.

The HTTP host writes the final request profile ID only when
`request.canPersistProfile` is true, otherwise it expires the identity cookie,
including after an upstream failure. The request facade is destroyed and its
retained readonly state finalizes the cookie once in `finally`, before successful
rendering uses the request's `res.locals`. Preview writes no identity cookie.
The cookie is host-only, `Path=/`,
`SameSite=Lax`, readable by JavaScript, lasts 365 days when granted, and uses
`Secure` on HTTPS (omitted for local HTTP). Current-request handoff state can
remain volatile when persistence is denied. The SDK permits identify/page without
event consent by default; denial does not mean no network requests.

Browser subscriptions mirror effective SDK consent into these two app cookies
immediately and on subsequent changes. Undefined removes that axis's mirror;
explicit decisions use host-only, Path=/, SameSite=Lax cookies with a 365-day
lifetime and Secure on HTTPS. Mirrors inform only the next server request; they
are never passed back as browser constructor defaults. Combined Grant/Revoke
controls call `sdk.consent(true/false)`. They neither fetch content nor send pages.
SDK identity cookies are host-scoped and may be shared with other local apps on that host;
ports do not isolate cookies. Browser LocalStorage is origin-scoped and is not
read by this server.

## Browser activation

`public/js/app.js` reads the non-executable bootstrap and constructs one Web SDK
with the public configuration and no consent/profile defaults. Automatic views,
hovers and clicks use their enabled defaults. SDK storage resolves existing browser
decisions.
The identity cookie config matches the server: host-only, `/`, `lax`, HTTPS-only
Secure, 365 days. Views use the SDK's default viewport root, which accounts for
scroll-container clipping. The app registers manual views from each element's
actual `data-reference-view-attribution`. Valid manual data needs no automatic
tracking attributes. The SDK observes existing SSR elements and later DOM changes
without waiting for handoff hydration.

The control panel subscribes to consent, persistence consent and profile before
hydration. It mirrors each consent snapshot and shows profile availability without
printing profile data or claiming confirmed identification. Controls remain disabled
until activation completes. Independently of tracking, the app awaits
`hydrateHandoffState()` for the visible pathname plus search. It never calls
`page()`, `trackCurrentPage()` or `fetchExperience()` during startup and does not
replace or rerender the server DOM.
State hydration transfers profile state; it does not select content or provide a
DOM hydration engine. Analytics needs a current profile identity at event emission;
the constructor can adopt persisted profile or cookie identity, and the server
handoff is another source.

SDK consent still gates automatic and manual measurements. The SDK owns dwell,
intervals, event queues and delivery; a submission/attempt is not a delivery promise.
On a startup failure, the app shows an activation error, disables/disposes controls
and diagnostics, releases any partial manual
registrations and destroys the failed owner while preserving the server content
and ordinary links. There is no compensating page/fetch or automatic recovery.
Caller-owned subscriptions are disposed on final document exit; SDK hide/unload
handlers retain responsibility for their final measurements/flush. A BFCache
suspension retains this document's instance and subscriptions.

## Client navigation and visitor actions

After activation, the app intercepts ordinary same-origin Home/Page Two links and
handles back/forward through one live Web SDK. Direct links still work through
Express/EJS without JavaScript. Each client navigation updates the URL, document
title, active link and main focus, awaits one `sdk.page()` with captured route
context, then fetches the route’s independent distinct IDs concurrently.
A refused, failed or offline-admitted page does not prevent valid baseline content.
Home uses three IDs and Page Two two with the default configuration;
manual presentations reuse those plans. Browser fetches use the public SDK's
preview-first selection and automatic source-map requests under this app's default
automatic tracking configuration, including when preview or consent suppresses
measurements. The Node server keeps explicit source-map requests for ordinary
Delivery fetches because it has no browser automatic-tracking policy.
There is no cross-cycle plan cache.

The small DOM renderer follows the EJS registration, named-slot and prop-precedence
contract. Native HTML templates hold fixed markup; plain values use text APIs,
Rich Text uses the Contentful renderer, and real attribution uses the public SDK
helper. Flattened composed nodes stay siblings. Optional delivery diagnostics
preserve content with only a generic issue count in client output as on the server.
Local rendering errors, thrown service errors, loading and empty plans have distinct
feedback; the SDK's Personalization request-state observable does not stand in for
content completion.

Identify sets the fixed `?userId=charles` intent using `history.replaceState` and
calls the ordinary `sdk.identify()` action once with captured page context. It
joins any pending navigation work, then content waits for the identify operation
before selection; no page or per-fetch identify is added. Offline queue admission
does not confirm evaluated identity, and content can still render with baseline
state. Navigation and back/forward preserve URL intent without resubmitting identify;
a document reload requests that intent through the server’s request facade.
The panel reports intent only, never confirmed traits or authentication.

Retry content starts a fresh content load. It joins pending visitor work and
sends no new page or identify, including after a failed page or missing profile.
The persistent Retry content button also lets a visitor explicitly refetch partial content. Fetching never
restarts automatically from consent/profile subscriptions or a service response.

Reset removes identify intent and invalidates old render/page ownership. In the
same synchronous transition it removes old attributed content, detaches from any
old pending visitor work, then calls `sdk.reset()`. A fresh page/fetch cycle starts
for the next visitor. SDK reset resumes discovery immediately, so old content must
already be detached; the app does not use repeated enables as interval resets.
New manual roots are registered only after new content is inserted. Normal
navigation instead allows removal measurements to finalize at the microtask
boundary before clearing the detached elements' explicit manual registrations.

Render generations prevent stale responses, errors and custom-action feedback from
replacing a newer route or visitor. Visitor work has separate ownership so
Identify/Retry joins pending operations; reset detaches the previous visitor.
Already submitted SDK requests/events are not undone.
The SDK continues to own profile updates, consent, detectors, queues and lifecycle
isolation; the app adds no alternate profile store, event queue or observer.

`src/shared.ts` holds only common route, node-preparation and page-context rules.
Its SDK imports are type-only. Both adapters use the same compiled JavaScript;
server EJS and browser DOM operations remain separate.

Page Two's Record custom action calls `sdk.track({ event: 'reference_custom_action' })`
independently of content. It waits for pending visitor work, disables the button while
submitting, and reports admission/refusal/failure without claiming delivery from
admission alone. The action is never attached to XDA. On final document exit,
caller-owned route/control listeners and subscriptions are disposed; a BFCache
suspension retains the document's owner and state.

## Optional browser attempt diagnostics

`public/js/tracking.js` follows the Web reference's sidebar. One
`sdk.states.eventStream` subscription starts during initial tracking setup, before
hydration, and persists across client routes. The counter counts every defined
notification, including the ordinary explicit identify action. It records attempts
before transport/queue admission; neither a row nor its count confirms delivery. Consent-blocked calls are not eventStream attempts.

Only view/hover duration updates with their actual interval IDs share a row;
other notifications receive separate rows. The count can therefore exceed the
visible row count. Event labels use text APIs, and the sidebar shows only event
type, entity/identify/custom-action label, page pathname, duration and age, not
full event, profile, handoff or delivery-diagnostic payloads. The age timer and
subscription are disposed on failed activation or final document exit and retained
for BFCache suspension. Reset clears the observable but retains displayed history.

The initial server page and ordinary server identify are absent from this browser
stream. State-only hydration does not replay them; an empty sidebar after startup
is expected until the browser attempts an event. With consent, SDK measurements
on the existing server HTML can produce those attempts. Diagnostics render failures
show only a generic console message and do not interrupt event submission.

## What consumers should copy

The comments mark responsibilities: `Consumer integration` is the host/SDK
boundary, `Reference app` is demo presentation, `Maintainer` is optional local
inspection, `E2E compatibility` identifies real observable output, and
`Known limitation` explains current constraints.

| Responsibility                 | Files to inspect                                                                    | What to adapt                                                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Server SDK and state handoff   | `src/app.ts`, `src/cookies.ts`                                                      | Request-local context/consent/identity, page/fetch order, final state-only producer, cookie scope and private HTML-safe response |
| Browser adoption and lifecycle | `public/js/app.js`, `public/js/control-panel.js`                                    | One Web instance, immediate SSR observation, independent state hydration, effective-consent mirrors and subscription cleanup     |
| Content and attribution        | `src/index.ejs`, `public/js/experiences.js`, `src/shared.ts`                        | Your registrations, bindings, named slots, renderers and real automatic/manual attribution                                       |
| Demo UI                        | `src/index.ejs`, `public/js/control-panel.js`, route handlers in `public/js/app.js` | Replace fixed `userId=charles`, routes and buttons with your own visitor experience                                              |
| Optional diagnostics           | `public/js/tracking.js`, sidebar and `tpl-event-row` in `src/index.ejs`             | Omit the module, its create/dispose calls and markup if attempt inspection is unnecessary                                        |
| Local repository preparation   | `project.json`, `package.json`, `scripts/build-assets.ts`                           | This reference's tarball/Nx workflow; a consumer normally uses its own package installation and build                            |

The browser SDK constructor comes from the installed classic UMD. The small shared
module has type-only SDK imports; Rich Text and pure tracking helpers are a separate
asset. Do not bundle a second stateful SDK when adapting this renderer. Native
templates and EJS are presentation choices, not requirements of profile hydration.
`data-testid` selectors inspect actual UI and have no role in SDK tracking, which
uses the real attribution attributes or explicit element registration.

`PortableRenderPlan` types the tree and attribution, while `props.content` remains
`Record<string, unknown>`. Generated CDA declarations describe source fields and do
not automatically type transformed bindings. This app adds no duplicate content
schema or generator; its TypeScript check does not check EJS or browser property
accesses. Adapt content mappings to the configured bindings and inspect live output.

Optimization's pinned hybrid reference previews an initial event batch and lets
the browser hydrate/replay it. This reference uses ordinary committing XPAPI
server events before profile-only content and state-only browser hydration.
It does not demonstrate XDA server preview followed by browser submission.
Event-bearing XDA always forces XPAPI `preflight: true`, without an override;
new IDs are provisional and previewed changes stay uncommitted. SDK auto-adoption,
state hydration, localStorage and cookies do not finalize them. Prepared replay
and actual Personalization API preflight remain supported. See
[XDA preflight and profile finalization](../../packages/runtime/README.md#xda-preflight-and-profile-finalization).

A strict server-preview/client-submit flow needs successful browser commit/replay;
same-ID binding and commit completion are not currently proved. With multiple
server Experience evaluations, client reconciliation of multiple preview profile
IDs/results is still required even with a future preflight toggle, unless the
server finalizes and breaks that contract. Sequential fetching, a shared facade
or selecting one profile does not solve this; no architecture or shared preflight
transaction API is chosen here. Independent profile-only reads with an
already-concrete profile remain viable. Admission, `identityReady`, flush resolution
and generic SDK success alone do not prove a commit.

## Current live behavior and limits

Before this cleanup, both routes displayed baseline content in direct
JavaScript-disabled browser visits. Identify-bearing requests selected the composed
fragment variant and reversed the Personalized Composed content order in some responses, while other
fetches retained baseline content or reported partial delivery. Treat URL intent
and HTTP 200 as insufficient proof of confirmed traits/audience membership.
The app retains those results without automatic content retries or compensation.

The earlier cleanup recorded user-reported fixes to XDA profile-only selection,
initial identify and full built-event acceptance as the deployment premise for
removing workarounds, not a new live observation. The user now explains the
previously observed GET failure for an XDA-created profile by forced preflight: a
new ID is provisional, and profile-only XDA internally uses XPAPI GET, returning
404 for an uncommitted ID even if the SDK-to-XDA hop uses POST. The separate
`context.page.title` 422 remains unresolved. The current flow submits ordinary
committing XPAPI identify once per explicit intent and uses concurrent independent
profile-only content loads. It retains ordinary page ownership, joins pending
identity/page work, and keeps reset/lifetime guards. Missing profile and prior
page failure no longer trigger page-specific content recovery.

The following limits describe the earlier live verification; phase 6 local
lint/typecheck checks do not establish new service behavior or event counts.
Live verification did not encounter empty/missing-Experience, transport/render/
initialization or startup failures. Client partial-warning handling, HTTPS cookies,
final-exit subscription/timer disposal and BFCache restoration were reviewed in
source but not observed live. These are validation limits, not diagnosed defects.
TypeScript does not check EJS or browser content property accesses/live binding shapes.

## DX assessment

The public SDKs support this committed SSR flow, final-profile adoption, real
attribution, consent and interaction measurement. A consumer supplies the HTTP
cookie/consent bridge, private HTML-safe serialization, content renderers/bindings,
and route/action sequencing with lifecycle guards. The file mappings above expose
these application responsibilities; the sidebar remains optional.

Local package refresh now has one aggregate command, while focused setup remains
available. Remaining limits include provisional-profile finalization and strict
hybrid multi-preview reconciliation described in the
[Runtime contract](../../packages/runtime/README.md#xda-preflight-and-profile-finalization),
no DOM hydration engine, and unknown-valued content through plans. EJS/browser
property accesses require live inspection because the app typecheck does not cover
them. Existing service-selection variability and unobserved failure/HTTPS/BFCache
paths limit the evidence; the reference adds no alternate mechanism to hide them.

## Setup and refresh

Use Node 24 for repository tooling (validated with Node 24.15.0 and npm 12.0.2).
The standalone manifest declares Node >=22.13.0, matching the sibling references.
Start with root dependencies installed using the repository's `npm ci` workflow.
Run these commands from the repository root:

```sh
npx nx run implementation-node-sdk-web-sdk:setup
npx nx run implementation-node-sdk-web-sdk:dev
```

`setup` builds/checks/packs **both** Node and Web dependency chains, installs this
app through `scripts/install-implementation.ts`, and builds browser assets.
Installation replaces only this app's `node_modules`, disables workspaces,
lifecycle scripts and lockfile generation, and creates `.env` from `.env.example`
only when missing. Existing `.env` values survive installation/build/cleanup.
Direct third-party dependencies reuse exact pins from the sibling manifests.
Registry transitive dependencies resolve on each install; this development
workflow does not provide lockfile-level reproducibility.

After SDK source/artifact changes, run `setup` again, or use root
`npm run implementation:install` to refresh all references. Stop running apps with
their scoped `serve:stop` targets before refreshing dependencies, then relaunch
with `serve` or `dev`. For separate steps:

```sh
npx nx run implementation-node-sdk-web-sdk:install
npx nx run implementation-node-sdk-web-sdk:build
```

`install` packs both chains and refreshes the installed archives. `build` uses only
already installed packages; it never installs. Archives use stable `pkgs/*-local.tgz`
aliases with app-local overrides for Client, Runtime and Core. There are no source
aliases or imports from internal SDK packages. The application has no dependency
on the adjacent Optimization checkout or its reference apps.

## Local configuration

Setup copies placeholder-only `.env.example` when `.env` is absent. Populate it
with a real space and public delivery credential before visiting content routes.
Initial local setup may copy only `SPACE_ID`, `ENVIRONMENT_ID`, `CDA_TOKEN` and
`LOCALE` from the configured Node reference; existing configured app-local values
must be preserved. Runtime always reads this app's file alone. Do not put real
credentials in `.env.example` or Git.

| Setting          | Meaning / default                                                   |
| ---------------- | ------------------------------------------------------------------- |
| `SPACE_ID`       | Required nonempty Contentful space ID                               |
| `CDA_TOKEN`      | Required nonempty delivery token suitable for browser exposure      |
| `ENVIRONMENT_ID` | `master` when absent or blank                                       |
| `LOCALE`         | `en-US` when absent or blank                                        |
| `EXPERIENCE_IDS` | Optional comma-separated IDs; absent/blank uses the shared defaults |
| `PORT`           | Integer 1–65535; default `3300`                                     |

The default Experience IDs are `3fLAdFb3BYAuImRhcW8k4t` (Coded),
`4WzbgzPQHa9Tr2ffbOU8p7` (Composed), and `7u2eP09B4BIBToH8UwSHck`
(Personalized Composed). The config resolves/deduplicates IDs without fetching.

`src/config.ts` parses only this app's `.env` using dotenv. It does not merge
`process.env` or fall back to sibling/mock configuration. `PORT` overrides belong
in this file. The ordinary explicit public projection contains only `SPACE_ID`,
`ENVIRONMENT_ID`, `CDA_TOKEN`, `LOCALE`, and resolved `EXPERIENCE_IDS`.
Only that projection and the final SDK profile handoff are serialized into the
HTML-safe bootstrap. Never copy management or server-only preview tokens or expose unrelated
settings. No values are baked into
browser assets. Optional preview endpoint settings are described above.

## Run and stop

The default address is [http://localhost:3300](http://localhost:3300), bound to
`127.0.0.1`. Use `localhost` consistently for later browser continuity checks.
The explicit document routes are `/` and `/page-two`; health is `/health`.
Unknown routes and missing assets return 404. GET and HEAD are supported;
other methods return 405. Responses use private/no-store caching.

```sh
npx nx run implementation-node-sdk-web-sdk:dev         # foreground; Ctrl-C stops it
npx nx run implementation-node-sdk-web-sdk:serve       # PM2 background
npx nx run implementation-node-sdk-web-sdk:status
npx nx run implementation-node-sdk-web-sdk:logs -- --lines 20 --nostream
npx nx run implementation-node-sdk-web-sdk:restart
npx nx run implementation-node-sdk-web-sdk:serve:stop
```

`dev`, `serve`, and `restart` build installed browser assets before launch; a failed
build prevents restart. They do not refresh SDK dependencies. All read the same
local `.env`. PM2 commands target only `experiences-node-web-sdk-app`; stop deletes
that named process and reports an error when absent. Run only one checkout with
that name at a time. Choose another local `PORT` if occupied; preserve unrelated
processes. Do not use global PM2 stop/delete commands for this app.

## Build and validation

```sh
npx nx run implementation-node-sdk-web-sdk:build
npx nx run implementation-node-sdk-web-sdk:lint
npx nx run implementation-node-sdk-web-sdk:typecheck
npx nx run implementation-node-sdk-web-sdk:clean
```

Root aggregate checks exclude implementations. Each target invokes ordinary local
npm scripts, so app-directory `npm run build`, `npm run lint`, `npm run typecheck`
and `npm run dev` also work. `clean` removes generated `public/dist` and private
`dist`, leaving configuration, dependencies and processes intact.
Typecheck first builds the shared module, then checks `src/**/*.ts`
and `scripts/**/*.ts`; ESLint also covers authored `public/js/**/*.js` when present.
Authored browser JavaScript is linted. EJS and browser property accesses are
not validated by the server typecheck.

With the app running, directly inspect both document routes, `/health`,
`/css/theme.css`, `/dist/contentful-experiences-web.umd.js` and `/dist/rich-text.js`.
Health returns `ok`; missing assets and unknown routes must return 404.
No automated tests, verification harnesses, mocks, fixtures or test-only hooks
are included. Installed public exports/types and the copied UMD distribution
remain required artifact checks after installation refreshes. Live checks must
inspect delivered content, not just HTTP success. The live verification limits
are described above.

## Files and provenance

- `src/app.ts`: Express/EJS, explicit routes, health, public-only static hosting,
  rate limiting (1000 requests per 30 seconds), request-local page/fetch orchestration,
  final handoff, generic errors and signal shutdown. Dot paths, traversal and public
  symlinks resolving outside `public/` are rejected.
- `src/config.ts`: implementation-local parsing, validation, defaults and public
  configuration allowlist and route presentation selection.
- `src/cookies.ts`: host adapter for independent consent decisions, permitted incoming
  identity and writing/expiring final SDK-owned identity.
- `src/index.ejs`: shell and common server-side card/Experience/content functions,
  used for SSR and native `<template>` elements in the same HTML response. Utilities
  uses the Web reference's main-pane field grid; content uses its split layout/theme.
- `src/shared.ts`: SDK-type-only common preparation, compiled once to `dist/shared.js`
  with private declarations; identical JS is copied to `public/dist/shared.js`.
- `public/js/templates.js`: native template cloning; no client EJS renderer.
- `public/js/app.js`: state-only startup adoption before automatic/manual observation;
  later route/page/content orchestration, visitor actions, stale guards, registration
  release, failure feedback and document exit cleanup.
- `public/js/experiences.js`: reference DOM renderer matching EJS bindings/slots,
  real automatic/manual attribution and generic partial-warning counts.
- `public/js/control-panel.js`: SDK state subscriptions, one-way app consent-cookie
  mirrors, profile availability and intent display; paired Grant/Revoke plus explicit
  Identify/Reset/Retry callbacks owned by route orchestration.
- `public/js/tracking.js`: optional browser-attempt sidebar, actual interval display
  grouping, safe text, age timer and caller-owned subscription cleanup.
- `scripts/build-assets.ts`: copies only the installed Web UMD/map and built shared
  module to generated `public/dist`, then uses Vite with `emptyOutDir: false`
  to build `rich-text.js`. No environment settings or source checkout paths are
  used as bundle inputs.
- `scripts/rich-text.ts`: Contentful Rich Text HTML renderer and the public Web
  `tracking-attributes` helper exports used by the browser renderer.
- `public/css/theme.css`: local copy of the Experiences Web theme, retaining
  Optimization commit `59add9d6ebff503b9033a59a2eee0149d4b4e925` provenance and MIT
  license. Its source was `lib/e2e-web/src/theme.css`; this is stylesheet provenance,
  not a testing dependency. No adjacent checkout is needed at build/runtime.

The pinned Optimization hybrid reference
`70dfa7fba9b62f0920b712b3da261a412436b4b7` supplies the structural comparison;
Experiences retains this repository's npm/Nx, Vite, ESLint and scoped PM2 workflow.
Existing [Node](../node-sdk/README.md) and [Web](../web-sdk/README.md) references
remain independent. SDK contracts are documented in the public
[Node](../../packages/node/README.md) and [Web](../../packages/web/README.md) READMEs.

If dependencies/assets are missing or stale, rerun setup. If `.env` is missing,
copy `.env.example` locally. A standalone copy must preserve the relative
`implementations/node-sdk+web-sdk` and `pkgs` layout; install there with
`npm install --workspaces=false --package-lock=false --ignore-scripts`, then use
its local npm commands. Nx/root dependencies are unnecessary for building,
checking or running an already configured copy.
