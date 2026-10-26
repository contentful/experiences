# Experiences Node + Web SDK reference implementation

This standalone Express/EJS application consumes locally packed public
`@contentful/experiences-node` and `@contentful/experiences-web` packages. It has its
own dependencies and tools and stays outside root npm workspaces.

The current implementation includes **Phase 5 client navigation and visitor
actions, awaiting user acceptance**. Phases 1–4 are accepted. Home and Page Two render actual Experience
content as ordinary HTML, including named slots and Rich Text, with JavaScript
disabled. With JavaScript enabled, one Web SDK adopts the final server profile and
observes the existing HTML without a startup content fetch or page event. Utilities
shows activation/profile availability and both consent decisions, with paired
Grant/Revoke, Identify, Reset and Retry content controls. Client navigation and
back/forward fetch and render through the same Web SDK; Page Two also has a separate
custom-event action. The event-attempt sidebar remains in Phase 6. `/health` checks local process liveness only; it makes
no API calls and does not establish upstream readiness.

The checkout-local [implementation plan](../../tmp/node-sdk-web-sdk-reference-implementation-plan.md)
defines the accepted design and phase gates. Phase 6 requires explicit acceptance
of Phase 5. The committed-server event flow and XDA limitations in that plan remain
authoritative. The accepted Phase 2 foundation is committed/pushed as `5095185`;
Phase 3–5 changes remain available for review in the working tree.

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
There is no event-attempt sidebar in this phase. On a startup failure, the app
shows an activation error, disables/disposes controls, releases any partial manual
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

Page Two's Record custom action calls `sdk.track({ event: 'reference_custom_action' })`
independently of content. It waits for any pending page, disables the button while
submitting, and reports admission/refusal/failure without claiming delivery from
admission alone. The action is never attached to XDA. On final document exit,
caller-owned route/control listeners and subscriptions are disposed; a BFCache
suspension retains the document's owner and state.

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

Direct live checks covered both server routes, baseline/identify output, attribution,
bootstrap shape, cookie grant/return/denial and headers. Accepted Phase 4 checks
confirmed unchanged startup DOM, hydration-before-measurement, cookie continuity
and real Analytics view/click/hover submissions. Startup remains separate from
client rendering; the Phase 5 reload showed no browser XDA or Personalization call.

Phase 5's client retry matched all 13 rendered server nodes for registration kind/ID,
stable identity, title/text, Rich Text and named slots. Retry made three distinct
XDA fetches with no page. Navigation sent one page before two Page Two fetches;
back/forward sent two pages and five total Home/Page Two fetches. Identify produced
only identify-bearing XDA calls with context/source maps and selected the inspected
variants. The custom action was refused without consent and then admitted with a
200 API response after Grant, without a content fetch.

A debugger inspection confirmed that Identify joined an actually pending navigation
page (one page, three Home fetches). Reset detached all old attributed/manual DOM
before `sdk.reset()`, cleared intent and produced a new visitor identity with baseline
content. In a live navigation/Reset overlap, the fresh visitor page started before
the old page response; only the current route's two content fetches followed.
Analytics view submissions for the newly rendered automatic Experience and all three
manual roots returned 200. A real reload retained the consented identity. Revoke
left the client-rendered content unchanged, made no request, and mirrored denial;
the checked browser is left with consent revoked. No browser error logs were observed
in these checks, and the read-only source review found no actionable defect.

No failing empty/missing-content, transport/render/initialization or startup case was
encountered during these checks. Those paths, client partial-warning handling,
HTTPS cookies and BFCache restoration have source review but no corresponding live
observation. Server partial-delivery warnings were observed in the accepted server
phase. These are validation limits, not discovered defects; no fixtures, mocks,
test-only hooks or forced failures were introduced. Temporary debugger breakpoints
were removed and no live handoff payloads were saved. TypeScript does not check EJS
or authored browser JavaScript property accesses/live binding shapes.

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

After SDK source/artifact changes, run `setup` again. For separate steps:

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

`dev` and `serve` build installed browser assets before launch. Both read the same
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
and `npm run dev` also work. `clean` removes only generated `public/dist`, leaving
configuration, dependencies and processes intact. TypeScript checks `src/**/*.ts`
and `scripts/**/*.ts`; ESLint also covers authored `public/js/**/*.js` when present.
Authored browser JavaScript is linted. EJS and browser property accesses are
not validated by the server typecheck.

With the app running, directly inspect both document routes, `/health`,
`/css/theme.css`, `/dist/contentful-experiences-web.umd.js` and `/dist/rich-text.js`.
Health returns `ok`; missing assets and unknown routes must return 404.
No automated tests, verification harnesses, mocks, fixtures or test-only hooks
are included. Installed public exports/types and the copied UMD distribution
remain required artifact checks after installation refreshes. Live checks must
inspect delivered content, not just HTTP success. Current results and unverified
paths are recorded in the local plan.

## Files and provenance

- `src/app.ts`: Express/EJS, explicit routes, health, public-only static hosting,
  rate limiting (1000 requests per 30 seconds), request-local page/fetch orchestration,
  final handoff, generic errors and signal shutdown. Dot paths, traversal and public
  symlinks resolving outside `public/` are rejected.
- `src/config.ts`: implementation-local parsing, validation, defaults and public
  configuration allowlist and route presentation selection.
- `src/cookies.ts`: host adapter for independent consent decisions, permitted incoming
  identity and writing/expiring final SDK-owned identity.
- `src/index.ejs`: shared shell, route title, semantic document navigation, real
  content sections, initially disabled visitor controls and HTML-safe bootstrap.
- `src/browser-templates.ejs`, `public/js/templates.js`: native fixed browser
  markup and cloning for client route headers, cards, content/status and custom action.
- `public/js/app.js`: state-only startup adoption before automatic/manual observation;
  later route/page/content orchestration, visitor actions, stale guards, registration
  release, failure feedback and document exit cleanup.
- `public/js/experiences.js`: reference DOM renderer matching EJS bindings/slots,
  real automatic/manual attribution and generic partial-warning counts.
- `public/js/control-panel.js`: SDK state subscriptions, one-way app consent-cookie
  mirrors, profile availability and intent display; paired Grant/Revoke plus explicit
  Identify/Reset/Retry callbacks owned by route orchestration.
- `src/experience.ejs`, `src/nodes.ejs`: public plan/node attribution, named-slot
  recursion, reference binding rendering, empty content and generic partial warning.
- `scripts/build-assets.ts`: copies the installed Web package's complete `dist`
  unchanged to generated `public/dist`, then uses Vite with `emptyOutDir: false`
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
