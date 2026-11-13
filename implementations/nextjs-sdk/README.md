# Experiences Next.js SDK reference

This private application consumes packed public SDK packages outside the root npm
workspaces. It uses standard Next.js 15.5 hosting with React 19 and Node >=22.13.0.
Its server foundation shares the sibling references' content mappings, Contentful
Rich Text renderer, named `slot` presentation and locally vendored theme.

Start with App Router `/single-experience` or Pages Router
`/pages/single-experience` for the normal automatic one-Experience workflow.
The public binder owns fetching, resolution and management of the primary result;
Both import client components from their binding's `request` family. These routes
need no comparison loop or custom browser Root. They use the same registrations
and local configuration as the diagnostics below.

`/single-experience` demonstrates the normal automatic App Router integration:
one primary Experience, a server-bound registry and request policy, and a complete
server result passed to a client-bound request root and presentation. The browser
uses that supplied plan on activation without a startup content refetch.

App Router diagnostic Home (`/`) and Page Two (`/page-two`) and Pages Router Home
(`/pages`) and Page Two (`/pages/page-two`) share registrations, presentation,
Utilities, event controls and the tracking log in this one app. Pages uses one
stable browser owner in `_app`; App uses one stable root layout owner. Standard
Next links disable prefetch. Switching router families or rendering modes uses a
full document navigation.

The initial hybrid document uses the actual Node `fetchExperienceForHandoff`
result. Its plan and full handoff are reused by the presentation and root; supplied
plans require no startup browser fetch or duplicate initial page. Later comparison
IDs fetch sequentially without events on a separate identity-free Node request;
repeated containers reuse plans. The comparison request retains locale and preview
policy and the selected rendering mode's preflight policy, and is destroyed after loading. It never inherits the primary's provisional
XDA profile ID or changes the primary identity used for handoff and persistence.
Their ordering, identity and results are application-owned diagnostic behavior;
the SDK adds no multi-Experience controller, prefetch/result list or reconciliation.
Browser-local navigation, Identify and CUSTOM TRACK use ordinary Web content
fetches. Retry is an ordinary same-ID event-free fetch. The diagnostic host skips
Node SDK loading on hybrid navigation/data requests to preserve Web ownership;
the SDK server loader itself prepares every actual non-preview load.

The application-owned `ReferenceRenderingMode` selects `hybrid` or `server-only`.
Add `?mode=server-only` to either router's diagnostic routes for Node-rendered content with
optional browser analytics. Add `&analytics=off` to omit the browser owner.
The bindings set `request.mode: 'ssr'` for server-only rendering and `'hybrid'`
for actual transfers; the single-Experience routes explicitly use hybrid (the SDK default).
SSR-only controls use App Server Actions returning server JSX, or Pages Router
roundtrips through `getServerSideProps`. They perform no Web content fetch,
resolution or content rendering. Content remains visible while updates are pending
or fail; Reset removes the old attributed content before new visitor work. Matching preview revisions refresh the
server subtree through the router integration. Rendering works without JavaScript
and remains independent of replay admission or successful event delivery.

## Setup and lifecycle

From the repository root:

```sh
npx nx run implementation-nextjs-sdk:setup
npx nx run implementation-nextjs-sdk:dev
```

`install` packs Next, Node, Web and React dependency chains plus the existing
Preview artifact through `package-tools:pack-preview`. It uses the existing
`scripts/install-implementation.ts` helper. Installation replaces only this app's
`node_modules`, disables workspaces, install scripts and lockfile generation, and
copies `.env.example` to `.env` only when absent. `setup` then builds the app. Stop
this app before refreshing its dependencies. `build` never installs or packs.

Next build/dev/start commands set `NEXT_IGNORE_INCORRECT_LOCKFILE=1`, the installed
Next version's opt-out for automatic SWC lockfile repair. This standalone app
intentionally has no local lockfile; Next must not search upward and patch the
repository lockfile. Scoped PM2 launch/restart passes the same flag, with
`--update-env` on restart. Dependency installation remains the maintained setup
helper's responsibility.

The `scope:implementation` project tag includes this app in root
`npm run implementation:install` and Build CI's reference build/lint/typecheck
selection. Ordinary root aggregate checks exclude reference apps.

```sh
npx nx run implementation-nextjs-sdk:install
npx nx run implementation-nextjs-sdk:build
npx nx run implementation-nextjs-sdk:lint
npx nx run implementation-nextjs-sdk:typecheck
npx nx run implementation-nextjs-sdk:serve
npx nx run implementation-nextjs-sdk:status
npx nx run implementation-nextjs-sdk:logs -- --lines 20 --nostream
npx nx run implementation-nextjs-sdk:restart
npx nx run implementation-nextjs-sdk:serve:stop
npx nx run implementation-nextjs-sdk:clean
```

Local npm scripts expose the same commands. `dev` runs standard `next dev`;
`start` serves an existing production build. `serve` and `restart` build before
launching or restarting. PM2 manages only `experiences-nextjs-sdk-app`.
All hosting commands bind `127.0.0.1:3500`; use
[http://localhost:3500](http://localhost:3500) consistently. Pass `--port` to the
foreground Next script if that port is occupied, and set app-local `ORIGIN` to
match that address. Never stop unrelated processes.
`clean` removes only `.next`, `out` and the local TypeScript incremental output.
The API-free `/health` endpoint returns `ok`.

For a production run of this reference, install its packed dependencies,
keep the private app-local `.env` on the server, then use `npm run build` followed
by `npm run start` from this directory, or the scoped `serve` target above.
Standard Next hosts the dynamic routes; no custom server or static export is used.
Set `ORIGIN` to the trusted address visitors use. The configured SDK and `.env`
values are read lazily on the first content request and retained for that server
process; restart after changing them. Health does not initialize the SDK.

## Configuration and boundaries

Populate this app's `.env` with real `SPACE_ID` and `CDA_TOKEN`; tracked
`.env.example` contains no credentials. `ENVIRONMENT_ID` defaults to `master` and
`LOCALE` to `en-US`. `ORIGIN` defaults to `http://localhost:3500` and must be a
trusted HTTP(S) origin without credentials, path, query or hash. It supplies page
URLs independently of incoming Host/forwarded headers; match it to the actual
hosting address when changing the port. An optional comma-separated `EXPERIENCE_IDS` overrides the
shared defaults:

- `3fLAdFb3BYAuImRhcW8k4t` — Coded Experience
- `4WzbgzPQHa9Tr2ffbOU8p7` — Composed Experience
- `7u2eP09B4BIBToH8UwSHck` — Personalized Composed Experience

`src/config.ts` reads only this app's `.env` lazily at request time. Its Node
filesystem dependencies remain server-local; Pages GSSP strips those imports from
the browser build, and App request loading is guarded by `server-only`.
The browser projection is a fixed allowlist of scope, locale, configured IDs,
explicitly designated browser credentials and Preview Session binding settings.
It never spreads `.env`, serializes an SDK, reads sibling configuration, or exposes
private `CDA_TOKEN` / `PREVIEW_TOKEN`.

Ordinary browser Delivery defaults to the real same-app `/api/delivery` proxy.
The SDK uses an explicit tokenless trusted host; the proxy supplies private upstream
authentication, limits requests to this scope and configured IDs, preserves the
generated rename/feature headers, and returns private/no-store responses. An optional
`BROWSER_CDA_TOKEN` enables direct Delivery instead and must be explicitly approved
for browser exposure. Active Preview Sessions use the separately designated
`BROWSER_PREVIEW_TOKEN` and optional `BROWSER_PREVIEW_HOST`; the app provides no
WebSocket broker and never substitutes the private preview token. Inactive preview
does not require a browser preview token.

Built-in browser roots inherit space/environment and locale from server setup;
their Delivery configuration is explicitly supplied through App's `browser`
configuration or flat Pages browser SDK options, never copied from private server
credentials. The existing Runtime still requires
Delivery configuration for an analytics-only browser owner. Function-valued
callbacks, custom fetch implementations and Preview Session initializers remain
advanced setup in a client module.

Optional preview settings are `LIVE_PREVIEW_ENABLED`, `PREVIEW_TOKEN`,
`PREVIEW_HOST`, `LIVE_PREVIEW_EXPERIENCE_ID`,
`LIVE_PREVIEW_SESSION_HOST` and `LIVE_PREVIEW_RESOURCE_RESOLUTION`. The optional
package is installed from its unchanged artifact. Preview activates only when
`LIVE_PREVIEW_ENABLED=true` and a nonempty `preview_session_id` is supplied in the
URL. The SDK uses the resolved primary Experience ID for its managed session.
This diagnostic application can select its primary descriptor from local settings
or `preview_experience_id`; the SDK does not interpret that override itself.
The URL session belongs to the SDK execution context. Ordinary client actions and
diagnostic comparisons use the same fetch and renderer arguments as Delivery;
session updates reach only presentations matching the raw payload's Experience ID.
`LIVE_PREVIEW_SESSION_ID` is retained in local `.env` only for convenient copying;
application/build code never reads it. Both preview fields are blank in
`.env.example`. Missing/empty session parameters and a falsy flag keep the request
ordinary, even with a nonempty session parameter in the URL. The application supplies Preview configuration only when the deployment flag is
enabled. Next reads the request/browser URL session and determines `isPreview`,
retaining ordinary event handling and sidebar notifications under normal consent
and identity requirements when inactive. Active browser preview supplies the public Preview package’s synchronous
`createLivePreviewClient` factory through `preview.createClient`. Node owns policy and snapshot loading through ordinary
`fetchExperience`. Matching session requests omit ordinary locale/source-map fetch
options. Session snapshots use the configured Preview transport; the optional
package supplies only the browser live-update client.
Both content routes are dynamic and use `force-no-store`; ordinary Delivery uses
`createPrivateFetch`. There is no preview broker or application preview client.

Actual server primary loads follow the
[canonical preparation contract](../../packages/adapter-nextjs/README.md#router-bindings).
The single-Experience routes select one configured primary ID and let the SDK
manage it automatically. Diagnostic Home displays all configured IDs with the
first as primary. Page Two displays
only the last configured ID as primary. That route's primary fetch runs first with
initial intent; remaining display/comparison IDs load sequentially without events
on the separate comparison request.
Both routes reuse the first configured ID's plan for repeated containers; Page Two
fetches it after its primary when they differ. Official support is one Experience per page, unenforced; these
comparisons leave ordering, identity and result handling to the application and
provide no SDK multi-Experience or cross-fetch guarantee. Only an actual
server-to-browser transfer uses the Node full handoff result producer. Content
presentation does not depend on replay or submission success. Ordinary SSR/CSR
fetches default supplied personalization to `preflight: false`, committing admitted
intent. Hybrid server requests use true before admitted browser replay; XDA itself
defaults to true. This app adds no compensating Personalization API calls.

The initial ordinary fetch carries literal page-builder arguments and, only for
`?userId=charles`, literal identify arguments with `traits: { identified: true }`.
The SDK builds and consent-gates these inputs once. Later IDs carry no events.
Preview carries neither page nor identify intent. The request page comes from the
SDK's explicit page-context helper, using the trusted configured `ORIGIN` and
incoming referrer. The App request-aware adapter owns framework reads and render-local
memoization; Pages response helpers map the explicit `getServerSideProps` context.

Consent comes from separate application cookies
`experiences-nextjs-event-consent` and `experiences-nextjs-persistence-consent`,
using `granted`/`denied`; absence is undecided. Utilities provides independent Grant/Revoke controls, mirrored synchronously through SDK
observable subscriptions into these application cookies for subsequent requests. The host passes the cookie reader and explicit consent
separately. The public binding reads identity only with granted persistence consent
and excludes identity in preview; an identity cookie never grants consent.
Server Components do not write response cookies and the request binding has no
persistence method. Pages GSSP persists the primary's evaluated identity after comparison fetches at
`ctx.res`. App hybrid activation lets the existing Web SDK write the cookie when
persistence consent permits. Without JavaScript, Server Components cannot persist
a newly evaluated profile. Middleware forwards context only and does not capture
final RSC evaluation identity. App Server Actions bind the actual request, fetch content, persist the final cookie
through `persistAnonymousId`, and return a server-rendered subtree. Pages
controls use `router.replace(internalHref, visibleHref)` to run GSSP with explicit
identify/custom-track or event-free Retry intent while retaining the visible page.
The app-local `actionRouteKey` query carries that visible path and query; server-only
action responses return it as `experiences.routeKey` after same-path validation.
Identify adds `userId=charles` only to the internal request and the control records
successful action intent locally. Content actions do not start browser page intent;
ordinary route and query navigation still does. Pages GSSP
uses its writable response to persist the final identity. Preview suppresses
identity writes and deletions. There is no HTML update API or cross-router proxy.

These routes request `Cache-Control: private, no-store` and disable framework
content caching while retaining Next's framework `Vary` headers.
Hybrid plans use the public safe serializer and the actual Node handoff crosses
the private/no-store framework boundary. The browser preserves that initial batch;
later comparisons do not change its replay ID, route, locale or contents. Server-only
plans stay server-local; Pages serializes rendered HTML, and App passes opaque server
children. Both SSR-only update flows retain server rendering. Sidebar counts
only actual browser attempts and real interval IDs, not server events or confirmed
delivery. The sidebar retains at most 100 recent rows while its total attempt count
continues for the browser owner's lifetime. Retained interval updates preserve the
row's original ID, timestamp and position; an evicted interval returns as a new row.
Reset removes attributed DOM synchronously before `resetUser`, removes
URL identify intent, and retains the same browser root. View keys clear nonpage
action intent on route changes; Utilities reads initial URL intent, successful server
Identify intent and the SDK profile. Each `RequestResult` carries its
request identity, route, descriptor, optional plan/error and optional handoff.
Actual SSR attempts additionally mark `initialPageOwner: 'server'` and carry
private state hydration without replay. Matching browser adoption suppresses a
duplicate initial page, including after server consent drops or ambiguous errors;
page ownership does not prove commitment. Ordinary browser navigation retains
its own page behavior.
Both client request families receive that complete result through their root and
presentation, retaining its `requestId` history guard. Ordinary top-level
`Experience` remains the explicit Web flow for fresh actions and event-free
comparisons. See the [canonical adapter guide](../../packages/adapter-nextjs/README.md#automatic-single-experience-setup)
for result adoption, waiting, replay and preview behavior.

## Automatic App integration

`src/single-experience-server.tsx` binds `config`, `request.experience` and
`request.resolveOptions`, with `request.mode: 'hybrid'`, through
`bindAppRouterServerExperiences`. The request
family owns framework context, render-local memoization, primary fetching,
resolution and request cleanup. `src/components/SingleExperience.tsx` exports
`ClientRequestRoot` and `ClientRequestExperience` from the client binding's request
family with its browser registry. The page calls the lazy `singleAppExperiences()`
and awaits `request.loadExperience()`, projects it with
`serializeRequestResult`, then passes that same complete browser-safe result
to both client components. Root and presentation update together on navigation,
without a duplicate Web fetch. Context-only Node middleware supplies sanitized
request URL context.

`consent.server`, `consent.clientDefaults` and `cookie` keep server consent,
browser startup defaults and shared identity attributes distinct.
`request.pagePayload` travels as `result.initialPagePayload`. Pass the complete
result, including its `requestId`, without descriptor or payload overlays.
Rendering choices, page preparation/replay, Next prefetch/cache behavior and preview
follow the [canonical adapter guide](../../packages/adapter-nextjs/README.md#automatic-single-experience-setup)
and its [request contract](../../packages/adapter-nextjs/README.md#router-bindings).

`request.composeRequest` is an explicit escape hatch on the same facade for
application-owned diagnostic composition after every actual server primary fetch,
including RSC and Pages data, before cleanup. It adds no SDK multi-fetch/result list,
identity reconciliation, resource cache or controller. The Home/Page Two flow
below continues to use its existing explicit loader.

Next's bindings own Contentful Live Preview Session selection and lifetime through
`preview: { createClient, ...transport }`, present only in enabled deployments. The server supplies deployment configuration in the result; the client binds
the optional package’s client factory. The SDK infers
the primary Experience ID, reads the committed URL session, determines preview
mode, switches sessions in place and replaces its owned SDK on mode
entry/exit. Consumers need no preview-specific hook, wrapper or React key.
Request-history guards survive SDK replacement. This configuration controls
Contentful Live Preview content and event suppression, independently of Personalization API
preflight and rendering-mode commitment policy.

## Destination routes

Destination routes use the same request bindings with a Destination selector as
`request.experience`, one primary per request, in both routers and both modes:

| Router | Path selector                         | Node selector             |
| ------ | ------------------------------------- | ------------------------- |
| App    | `/destination`, `/destination/<path>` | `/destination-node`       |
| Pages  | `/pages/destination`, `.../<path>`    | `/pages/destination-node` |

The route remainder is the absolute Destination path (`/destination` is `/`); the
node routes select `DESTINATION_NODE_ID`. As on the diagnostic routes,
`?mode=server-only` selects `request.mode: 'ssr'` (ordinary Destination fetch with
page intent and `initialPageOwner: 'server'`); otherwise `'hybrid'` uses the Node
`fetchDestinationForHandoff` (server preflight, browser replay). Both modes pass
the complete result to the client request root and presentation, as on
`/single-experience`. `src/destination-server.tsx` binds the selector and mode as
functions of the request URL, so App's memoized `request.loadExperience()` is the
only Destination fetch for the page.

`DESTINATION_ID` enables these routes; it is blank in `.env.example`. When unset,
the routes render a "not configured" state without an SDK request and every other
route behaves as before. Optional `DESTINATION_PATH` (default `/coded`),
`DESTINATION_NODE_ID` (default `sdk-ci-personalized`), `DESTINATION_REDIRECT_PATH`
(default `/legacy`) and `DESTINATION_MISSING_PATH` (default `/missing`) follow the
`lib/mocks/scripts/seedDestination.ts` fixture and must be absolute paths. The
browser projection adds only these non-credential `destination` settings for the
navigation links. The same-app Delivery proxy additionally permits the configured
Destination's path and node Experience lookups (space-scoped, no environment) for
browser Retry. Destination delivery ignores `ENVIRONMENT_ID` and `LOCALE`.

Routing outcomes stay with Next. App pages call `applyAppRouterOutcome` on the
`loadExperience()` result before rendering request components: a redirect calls
`redirect()` and a missing path/node (`notFound`) calls `notFound()`, the normal 404. Pages GSSP returns `getPagesRouterOutcome(...)` (`{ redirect }` or
`{ notFound: true }`) before `{ props }`. Both map the redirect's Destination path
back to this router's route and keep `?mode=server-only`, so `/destination/legacy`
lands on `/destination/coded`. Redirect results carry no plan, handoff or page owner.
Standard links move between Destination routes with client navigation (RSC or
GSSP data requests run the same server routing); router and mode switches use a
full document navigation. Later browser results present a not-found or redirect
fallback; the SDK never navigates. Destination plans carry no source-map
attribution because the Destinations API accepts no `sourceMap` extension, so
automatic view, hover and click tracking does not fire for that content. Preview
Session updates bind by the resolved Experience id; Destinations have no native
preview. The diagnostic Home/Page Two flows keep selecting by Experience id and
narrow seeds with `experienceDescriptor`, because request descriptors are now a
selector union.

The reference tests cover settings, route/path mapping, selectors, mode selection,
redirect locations and seed narrowing without network access. Production build,
lint and typecheck pass against the packed SDK. The fixture is created separately
in the "Experiences SDK CI" space; these routes have not been verified against a
live Destination.

## Public server integration

The normal one-Experience examples bind server policy in
`src/single-experience-server.tsx`. App explicitly loads and serializes its result;
Pages loads the JSON-safe result in GSSP. `SingleExperience.tsx` exports both
client request families' components. `_app` retains the Pages request root.
Allowlisted runtime configuration stays separate from private server credentials.
Preview configuration travels in the result; client bindings retain the optional package’s client factory
bound at module scope.

`src/config.ts` owns lazy server configuration and its explicit browser projection.
`src/server-loader.ts` uses `bindAppRouterServerExperiences` with the
single-Experience request policy, bound `config`/`request.resolveOptions`, separate
`consent.server`/`consent.clientDefaults`, `cookie`, preview and initial-event policy. The adapter reads framework
request context and memoizes the actual descriptor result. The reference's
`composeRequest` callback receives the primary request facade and loads event-free
comparisons on a separate identity-free facade before the result is finalized;
the layout and page reuse the primary
result's full handoff and plans. `src/components/BrowserRoot.tsx` binds the public
App and Pages client families, with the registry and ordinary shared UI in one client
module. Separate router reads and factories feed the shared context, consent mirror,
shell and attempt log. Each router retains one browser owner across navigation;
the SDK manages preview session replacement and mode entry/exit. Pages
uses request roots for server results and ordinary components for Web-owned
diagnostic content.
The shared shell reads the current browser route separately from the whole server
result passed as `result={serverResult}` to the SDK request root. Initial content,
`initialPagePayload` (from `request.pagePayload`) and optional handoff retain the
request that produced them; no descriptor/seed/payload overlays are added.
The request AnalyticsRoot observes the primary Preview selection from its complete
result and request context. Session selection travels with the Experience descriptor;
the shared root has no separate content-identity prop.

`src/pages-server.tsx` uses ordinary `getServerSideProps` with
`bindPagesRouterServerExperiences(...).request.loadExperience`. The app supplies
the trusted origin with bound registry, request, consent, cookie and preview policy. The adapter maps the native
request to one facade, fetches the primary, runs the reference's event-free
comparison callback, persists the final cookie and destroys that facade. The helper
returns a JSON-safe `RequestResult` directly for GSSP props; raw plan/error
data is available inside `composeRequest` only. `_app` passes the `experiences` envelope as `result`
to the stable request root.
Pages server-only props contain rendered markup rather than a browser render plan.
`html-react-parser` converts that completed HTML into React elements for adoption
on both SSR and hydration, preserving its styles and tracking attributes. This
does not invoke the Experience renderer, fetch or resolve content in the browser.
The shared server presentations serve App RSC and Pages GSSP; the browser only adopts
that output. Server-only repeated presentations use the same manual-view section
as hybrid content, with automatic views, hovers and clicks disabled.
`ServerPresentations` wraps only the repeated section in the SDK's
`ManualViewTracking` boundary. Its DOM marker survives App RSC, Server Action
replacement subtrees and Pages HTML adoption. With browser analytics enabled, the
Web SDK selects attribution and maintains one manual view occurrence per real root
through its existing DOM observer. The reference owns no attribution parser or
registration reconciliation, and performs no browser content fetch or resolution
for server-only content. Initial hybrid plans remain independent of replay admission.

The reference uses explicit host helpers only at real host boundaries. The App
Server Action reads writable cookies/headers, binds the Node request and calls
`persistAnonymousId` after content evaluation. Its request is destroyed in
`finally`. Pages GSSP's public server binder handles its writable response cookie
boundary and JSON-safe result projection, without a manual serializer call in GSSP.
App's loader still exposes a raw server result, and its bound roots project
automatically. Both diagnostic request families run the same caller-owned
sequential comparison loop through `composeRequest`, with no events or second
initialization. Comparison facades receive false for SSR and true for hybrid; the layout reads only the shared primary. Comparisons change
neither its handoff nor its replay identity. The middleware only
forwards context through the supported Node request-handler entry.

Explicit event-free/no-page intent travels through the existing
`result.experience.personalization.events: []` field. Automatic roots respect it
for a matching result; no separate suppression flag is added.

Server response utilities, explicit/static inputs and their full contracts are
in the [Next SDK README](../../packages/adapter-nextjs/README.md).

## Components and validation

`src/components/ExperienceContent.tsx` groups ContentCard, CodedTemplate and their
shared ContentBody with the bare component registry and content checks. Generated
CDA declarations derive the source field types; this file expresses the configured
assembly aliases and Rich Text wrapper, as in the React reference. Components
retain checks for unknown-valued SDK bindings. Invalid bindings still produce the
generic renderer failure. Generated declarations
and typecheck do not validate every live content variant. Before rendering Rich Text,
the maintained `@contentful/rich-text-types` validator checks the document's node
shapes and parent/child rules for both cards and templates.

`src/components/ServerContentPage.tsx` uses the adapter-owned memoized result for
App presentation. `ClientContentPage` uses bound managed Experiences and owns manual registration,
while `ServerPresentations` renders server content at each supported server boundary.
`src/components/ExperiencePresentation.tsx` owns each attributed presentation,
including common diagnostics, for both ordinary and repeated plans. The server
and client rendering paths retain their own renderer and fallbacks.
The `src/app` and `src/pages` directories contain both router families and their
native update flows. SDK imports use public Next server and router entries.

The generated declaration is copied unchanged from the React reference. The theme
is copied locally from that reference, preserving Optimization stylesheet
provenance and the MIT license; the local layout retains its Utilities, split presentation and sidebar columns. No adjacent checkout, generator change, source alias, custom server,
E2E tooling, MSW or temporary consumer is required.

Release requires upstream resolution of all tracked XDA issues affecting supported
integrations and verification of the corrected service behavior.

After setup, run the focused reference regressions from the repository root:

```sh
node --experimental-test-module-mocks --import tsx --test implementations/nextjs-sdk/src/server-reference.test.ts implementations/nextjs-sdk/src/reference.test.ts implementations/nextjs-sdk/src/components/pages-content-action.test.ts implementations/nextjs-sdk/src/components/attempt-log.test.ts implementations/nextjs-sdk/src/components/ServerPresentations.test.tsx
```

The comparison tests use the installed Node SDK without network requests or `.env`
and cover primary identity isolation, comparison content, disposal and preview policy.
The server-presentation tests check escaped markup adoption, styles/tracking
attribute preservation and the serialized manual-view boundary around repeated content.
Web's maintained tests own malformed metadata, stable view occurrences, DOM replacement,
explicit overrides and consent/reset cleanup; React's boundary tests cover ref
forwarding, stable DOM and hydration without an SDK context.
The preview descriptor tests cover deployment/session gating, URL overrides, fallbacks
and source-map selection. These no-network tests do not exercise live Preview transport.

Run scoped build/lint/typecheck after the installed artifacts are refreshed. Inspect
Home and Page Two directly for delivered content, slots, Rich Text, errors and
repeated attributed containers. Static checks establish artifact/type consumption;
live content and server behavior require configured services. Production build, direct lint and typecheck validate installed tarball consumption.
Browser/service inspection and final packed SDK verification are also required.
The generated declaration is copied unchanged.
