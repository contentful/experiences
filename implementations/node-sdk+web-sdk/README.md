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
handler awaits `request.page({ properties: page })` and requires an accepted result
and SDK-owned profile before fetching content. Only `?userId=charles` requests the
fixed identify intent with `traits: { identified: true }`. The identify event is
built once with `request.eventBuilder` so it inherits that request's context, then
included in each distinct sequential fetch. Identify is not independently sent,
and the committed page is not attached again.

Home fetches all configured IDs and reuses the first plan for its manual
presentation. Page Two fetches the last ID for its automatic presentation and the
first for its manual presentation. Matching IDs are fetched once per response.
Each fetch requests `extensions: { sourceMap: {} }` and uses empty SDK resolver
registries. The EJS renderer distinguishes coded Component and Experience Template
registrations, follows actual named slots, and merges `design < content < resolved
< slots` (no registration defaults are configured). Plain values and attributes
use EJS escaping; Rich Text uses Contentful's HTML renderer directly. The server
does not read management exports or maintain duplicate content schemas.

Automatic plan containers and node roots use the public Web tracking-attributes
helper. Manual roots instead carry only their real innermost attribution as
attribute-escaped `data-reference-view-attribution` JSON. Repeated presentations
have separate DOM boundaries. No positive interaction opt-ins or manual
registrations are active before browser hydration. Browser activation uses the
existing SDK detectors; the application adds no interaction observer.

After the last fetch, public Node `createRequestHandoffFromData()` packages final
`request.profile` into a private-request, state-only handoff. The non-executable
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
including after an upstream failure. The cookie is host-only, `Path=/`,
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
with the public configuration, all three `autoTrackEntryInteraction` flags false,
and no consent/profile defaults. SDK storage resolves existing browser decisions.
The identity cookie config matches the server: host-only, `/`, `lax`, HTTPS-only
Secure, 365 days. SDK discovery can be active already; the initial HTML has no
positive interaction opt-ins and manual elements are not registered yet.

The control panel subscribes to consent, persistence consent and profile before
hydration. It mirrors each consent snapshot and shows profile availability without
printing profile data or claiming confirmed identification. Controls remain disabled
until activation completes. The app awaits `hydrateHandoffState()` for the visible
pathname plus search, then enables views with the scrolling `#app-main` as root,
hovers and clicks, and registers manual views from each element's actual
`data-reference-view-attribution`. It never calls `page()`, `trackCurrentPage()` or
`fetchExperience()` during startup and does not replace or rerender the server DOM.
State hydration transfers profile state; it does not select content or provide a
DOM hydration engine.

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
context, requires SDK-owned identity, then fetches the route's distinct IDs
sequentially. Home uses three IDs and Page Two two with the default configuration;
manual presentations reuse those plans. Each fetch explicitly requests a source map.
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
starts an explicit content cycle. It joins a navigation page already pending,
builds one identify with the cycle's page/locale/user agent, and includes that event
in each distinct XDA fetch. It does not send an independent identify or another page.
Navigation preserves the intent, and back/forward/reload use the visible URL's value.
The panel reports intent only, never confirmed traits or authentication.

Retry content starts a fresh content cycle. It joins a pending page and ordinarily
sends no new page; failed visitor initialization or missing SDK identity requires
an explicit new page before content can proceed. The persistent Retry content
button also lets a visitor explicitly refetch partial content. Fetching never
restarts automatically from consent/profile subscriptions or a service response.

Reset removes identify intent and invalidates old render/page ownership. In the
same synchronous transition it removes old attributed content, detaches from any
old pending page chain, then calls `sdk.reset()`. A fresh page/fetch cycle starts
for the next visitor. SDK reset resumes discovery immediately, so old content must
already be detached; the app does not use repeated enables as interval resets.
New manual roots are registered only after new content is inserted. Normal
navigation instead allows removal measurements to finalize at the microtask
boundary before clearing the detached elements' explicit manual registrations.

Render generations prevent stale responses, errors and custom-action feedback from
replacing a newer route or visitor. Page ownership is separate so Identify/Retry
can join the correct page. Already submitted SDK requests/events are not undone.
The SDK continues to own profile updates, consent, detectors, queues and lifecycle
isolation; the app adds no alternate profile store, event queue or observer.

`src/shared.ts` holds only common route, node-preparation and page-context rules.
Its SDK imports are type-only. Both adapters use the same compiled JavaScript;
server EJS and browser DOM operations remain separate.

Page Two's Record custom action calls `sdk.track({ event: 'reference_custom_action' })`
independently of content. It waits for any pending page, disables the button while
submitting, and reports admission/refusal/failure without claiming delivery from
admission alone. The action is never attached to XDA. On final document exit,
caller-owned route/control listeners and subscriptions are disposed; a BFCache
suspension retains the document's owner and state.

## Optional browser attempt diagnostics

`public/js/tracking.js` follows the Web reference's sidebar. One
`sdk.states.eventStream` subscription starts before hydration and interaction
enables, and persists across client routes. The counter counts every defined
notification, including repeated identify messages submitted through distinct XDA
fetches. It records attempts before transport/queue admission; neither a row nor
its count confirms delivery. Consent-blocked calls are not eventStream attempts.

Only view/hover duration updates with their actual interval IDs share a row;
other notifications receive separate rows. The count can therefore exceed the
visible row count. Event labels use text APIs, and the sidebar shows only event
type, entity/identify/custom-action label, page pathname, duration and age, not
full event, profile, handoff or delivery-diagnostic payloads. The age timer and
subscription are disposed on failed activation or final document exit and retained
for BFCache suspension. Reset clears the observable but retains displayed history.

The initial server page and embedded server identify are absent from this browser
stream. State-only hydration does not replay them; an empty sidebar after startup
is expected until the browser attempts an event. With consent, SDK measurements
on the existing server HTML can produce those attempts. Diagnostics render failures
show only a generic console message and do not interrupt event submission.

## What consumers should copy

The comments mark responsibilities: `Consumer integration` is the host/SDK
boundary, `Reference app` is demo presentation, `Maintainer` is optional local
inspection, `E2E compatibility` identifies real observable output, and
`Known limitation` / `XDA workaround` explain current constraints.

| Responsibility                 | Files to inspect                                                                    | What to adapt                                                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Server SDK and state handoff   | `src/app.ts`, `src/cookies.ts`                                                      | Request-local context/consent/identity, page/fetch order, final state-only producer, cookie scope and private HTML-safe response |
| Browser adoption and lifecycle | `public/js/app.js`, `public/js/control-panel.js`                                    | One Web instance, hydration before measurement, effective-consent mirrors and caller-owned subscription cleanup                  |
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
the browser hydrate/replay it. Here XDA lacks noncommitting content preflight, so
Node commits page before fetching and embeds identify in each distinct fetch;
Web adopts only final profile state. Do not copy Optimization's replay path into
this committed-server flow or add suppression/compensating requests.

## Current live behavior and limits

Both routes displayed baseline content in direct JavaScript-disabled browser
visits. Identify-bearing requests selected the composed fragment variant and
reversed the Personalized Composed content order in some responses, while other
fetches retained baseline content or reported partial delivery. Treat URL intent
and HTTP 200 as insufficient proof of confirmed traits/audience membership.
The app retains those results without automatic content retries or compensation.

This follows the existing [XDA workaround/removal guidance](../node-sdk/README.md#current-xda-limitations-and-workaround-removal):
page establishes identity first, and identify accompanies each distinct fetch
because profile-only selection can return baseline. XDA still lacks
noncommitting content preflight. This app uses state-only hydration data for a
committed server request; it does not exercise prepared replay or introduce a
suppression mechanism.

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
available. The remaining friction is the explicit page-before-fetch and repeated
embedded identify required by current XDA behavior, the absence of noncommitting
preflight and DOM hydration, and unknown-valued content through plans. EJS/browser
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
in this file. The explicit public projection contains only `SPACE_ID`,
`ENVIRONMENT_ID`, `CDA_TOKEN`, `LOCALE`, and resolved `EXPERIENCE_IDS`.
Only that projection and the final SDK profile handoff are serialized into the
HTML-safe bootstrap. Never copy management/preview tokens or expose unrelated
settings. No values are baked into
browser assets. Runtime configuration does not select alternate SDK endpoints.

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
