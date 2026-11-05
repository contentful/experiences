# Experiences Next.js SDK reference

This private application consumes packed public SDK packages outside the root npm
workspaces. It uses standard Next.js 15.5 hosting with React 19 and Node >=22.13.0.
Its server foundation shares the sibling references' content mappings, Contentful
Rich Text renderer, named `slot` presentation and locally vendored theme.

Start with App Router `/single-experience` or Pages Router
`/pages/single-experience` for the normal automatic one-Experience workflow.
The public binder owns fetching, resolution and management of the primary result;
App uses its `request.Experience`; Pages imports the bound `Experience` and
`ExperiencesRoot` components. These routes
need no comparison loop or custom browser Root. They use the same registrations
and local configuration as the diagnostics below.

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
policy, and is destroyed after loading. It never inherits the primary's provisional
XDA profile ID or changes the primary identity used for handoff and persistence.
Their ordering, identity and results are application-owned diagnostic behavior;
the SDK adds no multi-Experience controller, prefetch/result list or reconciliation.
Browser-local navigation, Identify and CUSTOM TRACK use ordinary Web content
fetches. Retry is an ordinary same-ID event-free fetch. Server RSC prefetch,
navigation and refresh do not restart the initial hybrid transfer.

The SDK hydration names are `preserve-server` and `server-only`. The reference's
URL controls select those modes; hybrid rendering uses `preserve-server`.
Add `?mode=server-only` to either router's diagnostic routes for Node-rendered content with
optional browser analytics. Add `&analytics=off` to omit the browser owner.
SSR-only controls use App Server Actions returning server JSX, or Pages Router
roundtrips through `getServerSideProps`. They perform no Web content fetch,
resolution or content rendering. Content remains visible while updates are pending
or fail; Reset removes the old attributed content before new visitor work. Matching preview revisions refresh the
server subtree through the router integration. Rendering works without JavaScript
and remains independent of replay admission or successful event delivery.

## Setup and lifecycle

From the repository root, once the SDK contracts and artifacts are ready:

```sh
npx nx run implementation-nextjs-sdk:setup
npx nx run implementation-nextjs-sdk:dev
```

`install` packs Next, Node, Web and React dependency chains plus the existing frozen
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
helper's responsibility; versions and the root lockfile are unchanged.

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
URL. Experience selection uses local settings or `preview_experience_id`.
`LIVE_PREVIEW_SESSION_ID` is retained in local `.env` only for convenient copying;
application/build code never reads it. Both preview fields are blank in
`.env.example`. Missing/empty session parameters and a falsy flag keep the request
ordinary, even with a nonempty session parameter in the URL. The bound request
receives an explicit `isPreview: false` in those cases, retaining ordinary event
handling. The browser owner and sidebar use the same explicit policy, subject to normal
consent and identity requirements. Active preview supplies a lazy implementation loader that imports the
public Preview package. Node owns policy and snapshot loading through ordinary
`fetchExperience`. Matching session requests omit ordinary locale/source-map fetch
options. Session transport uses the frozen helper without a custom fetch wrapper.
Both content routes are dynamic and use `force-no-store`; ordinary Delivery uses
`createNextjsPrivateFetch`. There is no preview broker or application preview client.

Ordinary SSR uses the primary request facade and ordinary Experience fetching.
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
presentation does not depend on replay or submission success. XDA preflight leaves
ordinary SSR/CSR events uncommitted; this app adds no XPAPI compensation or force flag.

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
`ctx.res`. App hybrid hydration lets the existing Web SDK write the cookie when
persistence consent permits. Without JavaScript, Server Components cannot persist
a newly evaluated profile. Middleware forwards context only and does not capture
final RSC evaluation identity. App Server Actions bind the actual request, fetch content, persist the final cookie
through `persistNextjsAnonymousId`, and return a server-rendered subtree. Pages
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
content caching. Production inspection returned `Cache-Control: private, no-store` while retaining
Next's framework `Vary` headers.
Hybrid plans use the public safe serializer and the actual Node handoff crosses
the private/no-store framework boundary. The browser preserves that initial batch;
later comparisons do not change its replay ID, route, locale or contents. Server-only
plans stay server-local; Pages serializes rendered HTML, and App passes opaque server
children. Both SSR-only update flows retain server rendering. Sidebar counts
only actual browser attempts and real interval IDs, not server events or confirmed
delivery. Reset removes attributed DOM synchronously before `resetUser`, removes
URL identify intent, and retains the same browser root. View keys clear nonpage
action intent on route changes; Utilities reads initial URL intent, successful server
Identify intent and the SDK profile. Each `NextjsRequestResult` carries its
request identity, route, descriptor, optional plan/error and optional handoff.
App passes that result to `request.ExperiencesRoot` and `request.Experience`;
Pages uses the top-level bound `ExperiencesRoot` and `Experience`. Roots accept an
optional `result`. Pages `Experience` accepts either the complete `result` or
existing managed props and retains presentation callbacks. The adapter rejects restored
original results after departure, including back/forward after Reset, while
accepting fresh server results. Ordinary
`Experience` inputs remain caller-owned. Fresh client actions use that ordinary
component with the full descriptor and new intent. Comparison results carry an
explicit event-free descriptor, so adopting or retrying them creates no page intent.
Router adoption and reset behavior belong to the adapter.

## Public server integration

The normal one-Experience example binds the server policy in
`src/single-experience-server.tsx`. `src/components/SingleExperience.tsx` exports
the App request renderer and the Pages binding's named `ExperiencesRoot` and
`Experience` components once, alongside the existing presentation fallbacks. App's
sibling `(single)` route group calls the lazy `singleAppExperiences()` once,
destructures `ExperiencesRoot` and `Experience` from its request family, and uses
plain JSX without manual result plumbing;
Pages uses native GSSP `request.loadExperience` and plain `<ExperiencesRoot>`
in `_app`, imported from the client binding. The registry is bound at module
scope; the allowlisted runtime environment is passed as flat root props because
this reference reads server configuration lazily. Normal Pages integrations bind
flat browser SDK options, `consent.clientDefaults` and `cookie` in their client
configuration module, with no manual browser/defaults/cookie remapping in `_app`.

`src/config.ts` owns lazy server configuration and its explicit browser projection.
`src/server-loader.ts` uses `bindNextjsAppRouterServerExperiences` with the
single-Experience request policy, bound `config`/`request.resolveOptions`, separate
`consent.server`/`consent.clientDefaults`, `cookie`, preview and initial-event policy. The adapter reads framework
request context and memoizes the actual descriptor result. The reference's
`composeRequest` callback receives the primary request facade and loads event-free
comparisons on a separate identity-free facade before the result is finalized;
the layout and page reuse the primary
result's full handoff and plans. `src/components/BrowserRoot.tsx` binds the public
App and Pages client families, with the registry and ordinary shared UI in one client
module. Separate router reads and factories feed the shared preview setup, context,
consent mirror, shell and attempt log. Each router retains one browser owner across
navigation; preview binding changes deliberately replace that owner. Pages
destructures the top-level roots and `Experience` from its stable binding; the
same `Experience` serves primary results and explicit managed diagnostic flows.
The shared shell reads the current browser route separately from the whole server
result passed as `result={serverResult}` to the SDK request root. Initial content,
`initialPagePayload` (from `request.pagePayload`) and optional handoff retain the
request that produced them; no descriptor/seed/payload overlays are added.
The request AnalyticsRoot receives the current route's primary Experience ID for
matching server preview revisions, falling back to the result's descriptor ID
when omitted. That presentation input does not replace the supplied result.

`src/pages-server.tsx` uses ordinary `getServerSideProps` with
`bindNextjsPagesRouterServerExperiences(...).request.loadExperience`. The app supplies
the trusted origin with bound registry, request, consent, cookie and preview policy. The adapter maps the native
request to one facade, fetches the primary, runs the reference's event-free
comparison callback, persists the final cookie and destroys that facade. The helper
returns a JSON-safe `NextjsRequestResult` directly for GSSP props; raw plan/error
data is available inside `composeRequest` only. `_app` passes the `experiences` envelope as `result`
to the stable request root.
Pages server-only props contain rendered markup rather than a browser render plan.
The shared server presentations serve App RSC and Pages GSSP; the browser only adopts
that output. Initial hybrid plans remain independent of replay admission.

The reference uses explicit host helpers only at real host boundaries. The App
Server Action reads writable cookies/headers, binds the Node request and calls
`persistNextjsAnonymousId` after content evaluation. Its request is destroyed in
`finally`. Pages GSSP's public server binder handles its writable response cookie
boundary and JSON-safe result projection, without a manual serializer call in GSSP.
App's loader still exposes a raw server result, and its bound roots project
automatically. Both diagnostic request families run the same caller-owned
sequential comparison loop through `composeRequest`, with no events or second
initialization; the layout reads only the shared primary. Comparisons change
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
generic renderer failure; removing duplicate identity `resolveData` checks removes
only their extra resolver diagnostic and corresponding banner. Generated declarations
and typecheck do not validate every live content variant.

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

Current Phase 10 DX validation remains pending until the root records source,
package and installed-reference results. Phase 10 is not accepted; optional React
Router/TanStack integration remains deferred to Phase 11, and broad example code
migration remains Phase 14.

After setup, run the focused reference regressions from the repository root:

```sh
node --experimental-test-module-mocks --import tsx --test implementations/nextjs-sdk/src/server-reference.test.ts implementations/nextjs-sdk/src/components/pages-content-action.test.ts
```

The comparison tests use the installed Node SDK without network requests or `.env`
and cover primary identity isolation, comparison content, disposal and preview policy.

Run scoped build/lint/typecheck after the installed artifacts are refreshed. Inspect
Home and Page Two directly for delivered content, slots, Rich Text, errors and
repeated attributed containers. Static checks establish artifact/type consumption;
live content and server behavior require configured services. Production build, direct lint and typecheck validate installed tarball consumption.
Browser/service inspection and final packed SDK verification belong to the coordinating
owner. The generated declaration remains byte-for-byte unchanged.
