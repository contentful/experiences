# AGENTS.md — Operating manual for `contentful/experiences`

A working doc for any agent (or human) hacking on this repo. Covers what's where, why decisions were made the way they were, and what's likely to trip you up. If something below is wrong or stale, fix it in place — this doc is living.

> **Audience:** Anyone touching this codebase. Read [README.md](./README.md) first if you've never seen the project; this doc assumes you've skimmed the customer-facing story.

---

## What this repo is

The renderer SDK suite for Contentful's **Experience Orchestration (ExO)** initiative. Customers register their design-system components against Contentful component-type ids, hand the SDK an Experience payload from XDA, and get back a rendered tree.

Long-term plan (per the Experiences SDK Suite RFC + the Component Domain Model RFC) is **multi-framework**: React first, with Svelte already shipped as a second adapter to validate the runtime-neutral architecture. Angular / Vue / SwiftUI / Compose follow. Adapter packages are cheap to add by design.

---

## Repo layout

```
experiences/
├── nx.json                   # Nx workspace (release config, target defaults, plugins)
├── tsconfig.base.json        # Shared compiler options (no path aliases — use workspace symlinks)
├── tsconfig.build.json       # tsup uses this; no path aliases, just compiler options
├── tsconfig.json             # Trivial root, extends base
├── package.json              # Workspace root — scripts + shared devDeps
├── eslint.config.mjs         # Flat-config ESLint, applies to all packages
├── catalog-info.yaml         # Backstage metadata for Contentful's internal portal
├── .contentful/              # Repo-local Vault config + GitHub Action permissions
├── .github/workflows/        # CI: build → check → release (release runs only on main)
├── packages/
│   ├── core/                 # @contentful/experiences-sdk-core (internal)
│   ├── design/               # @contentful/experiences-design (internal)
│   ├── client/               # @contentful/experiences-client (internal)
│   ├── runtime/              # @contentful/experiences-runtime (internal)
│   ├── node/                 # @contentful/experiences-node (customer-facing Node SDK)
│   ├── web/                  # @contentful/experiences-web (customer-facing Web SDK)
│   ├── live-preview/         # @contentful/experiences-live-preview (customer-facing, optional)
│   ├── adapter-react/        # @contentful/experiences-react (customer-facing)
│   ├── adapter-nextjs/       # @contentful/experiences-nextjs (customer-facing)
│   ├── adapter-svelte/       # @contentful/experiences-svelte (customer-facing)
│   └── adapter-angular/      # @contentful/experiences-angular (customer-facing)
├── examples/                # Customer-facing example apps
│   ├── nextjs/               # Next.js 15 example (external developers run this)
│   ├── sveltekit/            # SvelteKit 2 example (1:1 parity with nextjs)
│   ├── angular/              # Angular 22 + @angular/ssr example (parity with both)
│   ├── astro/                # Astro 7 example on the React custom-renderer entry
│   ├── vite-react/           # Vite + React client-only example
│   ├── vite-svelte/          # Vite + Svelte client-only example
│   ├── node/                 # node:http identity-cookie example (no renderer)
│   └── scripts/              # Bootstrap that seeds the demo Experience for the examples
├── implementations/         # Maintainer-facing reference implementations consuming local npm tarballs
│   ├── node-sdk/             # Express/EJS Node reference, managed through Nx
│   ├── web-sdk/              # Vanilla browser/UMD reference, managed through Nx
│   ├── node-sdk+web-sdk/     # Express/EJS SSR + browser/UMD hybrid, managed through Nx
│   ├── react-sdk/           # React/Vite runtime reference, managed through Nx
│   └── nextjs-sdk/          # Next.js App/Pages reference, managed through Nx
├── skills/                # Agent-invokable skills (SKILL.md), readable by any agent or person
│   └── implement-framework-adapter/  # Build a renderer for a framework with no first-party adapter
└── lib/
    └── mocks/               # Private Personalization/Insights handlers and Contentful maintenance tools
```

**`examples/`** is the stable, external-facing surface — every commit to it should keep the customer-facing "clone + bootstrap + run" flow working.

**`skills/`** holds agent-invokable guides in the `SKILL.md` format. When asked to render Experiences in a framework without a first-party adapter (Vue, Nuxt, Solid, Lit, Qwik, ...), follow [skills/implement-framework-adapter/SKILL.md](./skills/implement-framework-adapter/SKILL.md). Keep it in sync when adapter behavior changes (merge order, fallbacks, context, diagnostics).

**`implementations/`** holds reference implementations for SDK maintainers, not customers. Point integrators to `examples/`, never to a reference implementation as a how-to guide; link into `implementations/` only for authoritative maintainer detail (for example, the XDA workaround removal criteria linked from `packages/node/README.md`); see [CONTRIBUTING.md](./CONTRIBUTING.md#example-apps-vs-reference-implementations) for the split. Implementations stay outside npm workspaces and consume packed SDK artifacts.
Use `npm run implementation:install` to prepare all references, or scoped
`implementation-node-sdk`, `implementation-web-sdk`,
`implementation-node-sdk-web-sdk`, `implementation-react-sdk`, or
`implementation-nextjs-sdk` Nx `setup` / `dev` targets. Root aggregate checks
exclude implementations; the Build CI job explicitly prepares and checks them.
Follow [implementations/AGENTS.md](./implementations/AGENTS.md)
and the app README for the package boundary, local `.env`, and lifecycle commands.

### Package roles

| Folder                     | npm name                               | Audience                                                                                                                          |
| -------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core`            | `@contentful/experiences-sdk-core`     | **Internal.** Dependency-free payload/plan types, resolution, diagnostics, and design helpers.                                    |
| `packages/design`          | `@contentful/experiences-design`       | **Internal.** CSS-property helpers for adapter `toCss` utilities.                                                                 |
| `packages/client`          | `@contentful/experiences-client`       | **Internal.** Generated Delivery integration, free fetch functions, payload conversion, and XDA-derived request types.            |
| `packages/runtime`         | `@contentful/experiences-runtime`      | **Internal.** Shared runtime, complete `EventBuilder`, event metadata, Optimization transport, and handoff contract.              |
| `packages/node`            | `@contentful/experiences-node`         | **Customer-facing.** Node SDK with request-scoped fetch, resolve, destination, and event operations.                              |
| `packages/web`             | `@contentful/experiences-web`          | **Customer-facing.** Web SDK with browser-owned locale/context state, shared transport capabilities, and direct event operations. |
| `packages/live-preview`    | `@contentful/experiences-live-preview` | **Customer-facing.** Optional, framework-neutral Preview Session source.                                                          |
| `packages/adapter-react`   | `@contentful/experiences-react`        | **Customer-facing.** React renderer + re-exports of everything.                                                                   |
| `packages/adapter-nextjs`  | `@contentful/experiences-nextjs`       | **Customer-facing.** App/Pages request families, built-in roots and React rendering via explicit subpaths.                        |
| `packages/adapter-svelte`  | `@contentful/experiences-svelte`       | **Customer-facing.** Svelte 5 renderer + re-exports of everything.                                                                |
| `packages/adapter-angular` | `@contentful/experiences-angular`      | **Customer-facing.** Angular renderer (`^20 \|\| ^21 \|\| ^22`) + re-exports of everything.                                       |
| `lib/mocks`                | `mocks`                                | **Internal, private.** Source-consumed Personalization/Insights handlers and explicit Contentful maintenance tools.               |

**Customers install the framework adapter for rendering.** The optional `@contentful/experiences-live-preview` package is customer-facing and can be used directly by an application or as an adapter's live-preview data source. The framework adapters declare `core`, `design`, `client`, and `runtime` as dependencies.

`client` remains the Delivery and free-function boundary. The `runtime` package
is runtime-neutral and stateless with respect to request and browser state.
Its lower-layer `ContentfulExperiences` base accepts
`DeliveryClientOptions` configuration and constructs/owns its Delivery,
optional Preview, and Optimization clients; runtime constructors do not accept
caller-created clients. `accessToken` accepts the generated client's token
supplier. It may be omitted only when an explicit trusted proxy `host` is
configured: generated bearer auth is then disabled and that proxy owns upstream
authentication. The base exposes the Optimization service clients through
readonly `api` (`api.personalization` and `api.analytics`) and retains its typed leaf
configuration through readonly `config`. The runtime retains stable configuration and one base
`EventBuilder` configured with an explicit platform channel; it never retains
request-varying locale, resolver registrations, resolve options, profile, or
context. A `config` registry is required on each fetch or resolve operation,
while event-only operations need none. The public Node
SDK extends that runtime with
`ContentfulExperiences.forRequest()`, which creates a request-local facade for
fetch, resolve, destination, and event operations. Node profile and event
context are volatile request data. The public Web SDK is a sibling leaf over
Runtime, Client, and Core, not a subclass of Node. It inherits Runtime's trusted
custom-endpoint and direct by-ID preview capabilities. Web owns mutable browser
locale, browser context providers, and a LocalStorage-persisted profile. XDA
profiles cross the runtime-neutral boundary as `plan.personalization.profile`. Node and Web
retain the complete snapshot for later events; IDs remain sufficient for request continuity.
Personalized plans contain visitor-specific profile data and require private serialization/cache handling.
State interceptors apply before browser values are retained or emitted. Direct browser tokens are
credentials, but are intentionally browser-visible when their scope and the
endpoint's CORS policy make that appropriate; otherwise use a trusted proxy.

Both public leaves expose direct event methods: `identify`, `page`, and `track`
use the Personalization API, while `trackView`, `trackClick`,
`trackHover`, and `trackFlagView` use the Analytics API. Web now has an in-memory
Personalization queue for ordinary offline events and prepared-batch admission;
ordinary online Personalization events remain direct. Web also queues Analytics events
in memory (`AnalyticsDelivery`, adapted from Optimization's `InsightsQueue`), flushing
at 25 events, every 30 seconds, on reconnect, and on page hide (Analytics through the Beacon API, with Personalization also given a final forced attempt);
failed flushes retry with the shared backoff and circuit policy. Node sends
immediately. The SDK does not persist event data durably. Session preview suppresses events
independently of Live Preview connection status. The Web
runtime automatically tracks views, hovers, and clicks on elements carrying
`data-ctfl-scopes`, resolved within the nearest `data-ctfl-attribution` plan
container, and sends through the same direct methods. Container DOM identity
separates repeated presentations; shared keys retain multi-root grouping. `getTrackingAttributes` lives in core and is re-exported by every
adapter and by the `@contentful/experiences-web/tracking-attributes` subpath; no
adapter stamps attributes for you: renderers spread plan attribution onto each
Experience container and node attribution onto its outermost elements. Web accepts an explicit
`isPreview` boolean, falling back to initial nonempty `preview_session_id` detection
when omitted and `preview` is configured. URL session IDs alone do not enable preview.
Node integrations pass `isPreview: true` into `forRequest()`. Fixed read-only `isPreview` gates all events, automatic
tracking, embedded fetch personalization and handoff preparation/replay before event work.
Recreate Web when entering/leaving preview. CPA, `debug` and socket status do not set this policy.
Static preview without a Session ID requires explicit opt-in; raw `sdk.api` and free fetches remain outside it.

Each SDK Preview context has one active session and one Web connection. The
single `preview` configuration combines transport credentials, session settings
and optional `createClient` factory from the Preview package; Web defaults the session from the standard
`preview_session_id` query parameter, with an optional `preview.sessionId` override.
Renderers and fetches use normal Experience IDs.
The package returns one current Experience payload, not a multi-Experience source.
Node/Web route snapshots and updates by the reported `payload.sys.id`; only
matching requested/subscribed IDs receive session content, and missing IDs are
never guessed or broadcast. Other IDs retain their ordinary source.
`states.preview` exposes shared raw session state.
`subscribeToPreview(experienceId, FetchResolveOptions,
listener): Subscription` emits `PreviewUpdate` with optional plan/error, which can
coexist; status comes from `states.preview`. The binding never fetches snapshots
or owns per-view state. Web shares in-flight fetching/resolution and owns
mode/event/profile/lifetime policy; views retain presentation state. Do not add
SDK per-view state. View subscriptions detach independently; SDK destruction
closes the one context connection. Changing session replaces the context; React
and Next handle their owned SDK replacement without a consumer key. SSR-only adapters
observe matching content revisions for server refresh without browser resolution.
Snapshot runtimes expose inert undefined Preview state; other states are unchanged.

React managed integration uses Optimization's source/presentation controllers
with the thin binding.
Next integration reuses the same framework-neutral SDK owners. Its normal workflow
automatically fetches, resolves and manages one primary Experience.
App/Pages server families expose `request.loadExperience`. Both client bindings
expose ordinary Web components and a separate `request` family for full server
results. App server `request.Experience` defaults to `ServerExperienceRenderer`;
optional client `request.Experience` injection forwards its serialized result
through the same memoized load. Client request presentations inherit the nearest
request root's complete result unless explicitly supplied. Pages uses native GSSP
and client request presentation. Bind `config` and resolve options
once, with flat browser options, `consent.clientDefaults` and `cookie` in a client module.
Follow the canonical [rendering compositions](./packages/adapter-nextjs/README.md#automatic-single-experience-setup)
and [server preparation contract](./packages/adapter-nextjs/README.md#router-bindings)
for document/RSC/Pages evaluation, page events, replay, prefetch and preview ownership.
`consent.server`, `consent.clientDefaults` and `cookie` keep server consent,
browser defaults and response identity policy distinct. `request.pagePayload`
travels as `result.initialPagePayload`. The complete request result travels
without descriptor/seed/payload overlays; preserve its `requestId` history guard.
Built-in browser roots inherit scope and locale, but need explicit browser
credentials or a trusted authenticated proxy. Existing Runtime Delivery
configuration remains required even for analytics-only browser use. Advanced
callbacks/preview setup stay in a client module. Next's managed Live Preview
configuration is one `preview` object in server and
client bindings. Request results carry factory-free configuration; roots infer the primary Experience
and URL session from existing descriptor/route data;
owned SDKs are recreated on session changes and preview
mode entry/exit below the stable request-history boundary. Consumers need no
preview-specific wrapper, hook or key. Explicit browser credentials remain
separate from server credentials; optional-package imports may stay lazy. The
initializer/resolver path remains available; injected SDK lifetime stays caller-owned. `composeRequest` is an explicit
application escape hatch after every actual server primary fetch, including RSC and Pages data,
before cleanup; diagnostic multiple-fetch
ordering, identity and results stay application-owned. Add no declarative
multi-prefetch/results, reconciliation, resource cache, controller or barrier.
Registry/shared ownership, shared page
initialization, request memoization, applicable handoff envelopes and attribution
remain required. No complete-plan
preparation barrier or per-descriptor identify requirement applies. See the
canonical [Runtime preview limits](./packages/runtime/README.md#optional-runtime-live-preview).

React's optional `/router/react-router` and `/router/tanstack-router` entries
export `bindReactRouterExperiences({ config })` and
`bindTanStackRouterExperiences({ config })`. Bind once at module scope; each returns
the `createReactExperiences` result with wrapped `ExperiencesRoot`/`ExperiencesProvider`
and bound `Experience`, `useManagedExperience` and `ExperienceRenderer`. The entries
also export matching `*ExperiencesRootProps`, `*ExperiencesProviderProps` and
`*AutoPageContext` types, plus `AutoPagePayload`, `AutoPageEmissionContext` and
`AutoPagePayloadOptions`. React Router requires a data router (`useMatches`, optional
`react-router-dom` peer `^6.4.0 || ^7.0.0`); TanStack's optional `@tanstack/react-router` peer is
`^1.0.0`. Keep ordinary React imports and declarations independent of both routers.
Mount one stable wrapper inside the router above the primary managed `Experience`.
Roots reuse existing SDK ownership/cleanup; injected Providers leave SDK destruction
to the application. Existing owner props are retained except `routeKey`,
`buildPagePayload` and `initialPagePayload`, replaced by pinned `pagePayload` and
`getPagePayload({ context, routeKey, isInitialEmission })` options. Deeply merge
nested records: router metadata, static payload, then dynamic payload; later values
win and undefined layers are skipped. Metadata supplies hash/path/query/search/url.
Route keys always use pathname plus original search, without query re-encoding;
hash is metadata only. React Router derives basename-aware identity and metadata
through `useHref`, retaining raw router location/match objects. TanStack adopts
presented route/search matches, including a successful parent with a pending child;
location-only and fetching-status updates retain the previous route. Both bindings
share one internal wrapper factory and lazy payload composition. The existing
provider reads latest committed payload options without restarting a handoff on
inline object/callback or hash changes; absent payload capability remains absent.
Preserve existing server-handoff matching. No browser handoff
producer, tracker or direct page emitter is added: the existing root sequence owns
managed XDA page injection, explicit `personalization.events` remains authoritative,
and Retry stays event-free. See the
[router integration guide](./packages/adapter-react/README.md#optional-router-integration).

Web's `tracking` API follows Optimization's `enable`, `disable`, `enableElement`,
`disableElement` and `clearElement` controls for `views`, `hovers` and `clicks`.
Manual observation means developer registration of elements with real
`TrackingAttribution` in `options.data`; the SDK measures interactions. It does
not mean visitor-facing event buttons. Type-level disable preserves explicit
element enables, consent withdrawal discards intervals but preserves overrides,
and reset/destroy clear overrides. Repeated `enable` calls with unchanged
effective options preserve intervals; view roots default to `null` and equivalent
CSS `rootMargin` shorthands do not restart measurements. Changed effective view
options restart them. With rendered plan attribution, dynamic
`data-ctfl-track-views`, `data-ctfl-track-hovers`, and `data-ctfl-track-clicks`
attributes can opt permitted elements in even when automatic tracking is disabled;
explicit element overrides win. Discovery begins with browser SDK construction
and resolves attribution within rendered plan boundaries; valid manual data
works independently of those boundaries. Consent still gates all tracking. Keep
these controls on the existing detector and consent/lifecycle path; do not add
application-owned observers.

React/Next's `ManualViewTracking` client component marks opaque server content with
`data-ctfl-manual-views="true"`. Web's existing discovery path measures each real
root independently using its exact final scope token; explicit element overrides
win. This Experiences attribution source reuses the existing parser, observer,
detectors and consent/reset lifecycle. Do not add application-owned registration
maps or duplicate DOM observers for this path.

By-ID fetch options accept per-call `parameters`: strings/numbers or one-level
Records of string/number leaves. Experience.parameters declares IDs and bindings
use `$parameters/<id>`; there is no dynamic flag. Client flattens GET values into
`parameter.<id>[.<field>]` through the generated client's `queryParams`; empty
Records or defined extensions select POST with an unprefixed structured map.
The generated client supports POST `parameters`; transport tests verify the
actual wire body, auth, and rename header. Collection order is a single signed `fields.<apiName>` or
`sys.<id>` string, never binding `OrderTerm[]`. Delivery owns parameter validation
and fallbacks. Runtime/Node/Web forward values without retaining them; refetch and
replace the renderer's plan to swap content. Preview Sessions keep their existing
unprefixed `context.parameters` and server-owned WebSocket updates.

By-ID fetch options can also carry first-class personalization with a profile id
and existing type-tagged builder arguments or raw built events; Runtime/Node/Web
consent-gate inputs and build only arguments once. Client accepts raw built events
only and maps them to XDA's extension body, and Node
proxies it without retaining state. Node and Web filter those events by consent before the request, keeping the profile id. Destination fetches by path and node id accept the same raw built personalization events; all three fetches share consent, interception and profile handling. Event-bearing XDA always invokes XPAPI
with `preflight: true`, with no override; it commits neither events nor profile
creation/mutation. Newly returned IDs are provisional, and profile-only XDA uses
XPAPI GET internally even when SDK-to-XDA uses POST. Node/Web auto-adopt returned
IDs locally; adoption does not finalize them. See the canonical
[XDA preflight and profile finalization](./packages/runtime/README.md#xda-preflight-and-profile-finalization).
Preserve generic retry ambiguity for actual XPAPI commits.

Built XDA events retain `context.gdpr`. Web's default browser page provider
includes `title`, `hash`, `width` and `height`. Shared `buildPageView` keeps the
required `properties.title` string fallback; explicit `page` context and raw
caller-built XDA/Node/Client metadata remain caller-owned.
Client validates personalization with local `zod/mini` schemas matching the
installed dev.13 generated request types while preserving extra caller-owned
fields. Required event fields include `context.campaign`, `originalTimestamp`,
`sentAt`, and page-event `properties.title`. Screen events require `name` and
`context.screen`; property/trait values follow the generated contract and exclude
`null`. Optional fields accept omission or `undefined`, without null normalization
or undefined record omission. Preserve XDA's context/event contracts, including
`page.query` values of `string | string[]`; do not impose the full Optimization
context schema. Keep Client's `zod` dependency direct; do not add an Optimization
API client dependency or a Runtime import. Validate final transformed output
before final consent callbacks/publication, preserving input immutability.
Ordinary SSR uses Node fetch; CSR and
browser-local navigation/actions use Web fetch, accepting existing type-tagged arguments or raw built events
with SDK-owned construction once. Only actual server-to-browser transfers retain
the Node `fetchExperienceForHandoff` producer with `{ routeKey }` as its third
argument, returning full handoff plus optional plan/error. Web/React optionally
consume explicitly supplied server handoffs, independently of display.

SSR/CSR XDA events remain uncommitted as a tolerated service bug awaiting upstream
force-commit support. Add no SDK workaround or current force flag.
Same-ID Retry is ordinary event-free fetch without builders, event hooks or replay;
accepted incoming replay delivery retry remains queue-owned. Later reference
comparison IDs also use ordinary event-free fetch, without an SDK multi-Experience
or cross-fetch guarantee; official support is one Experience per page, unenforced.
Direct APIs remain callable, not initial prerequisites or compensation.
Replay is exercised by Node only as the backend of an actual hybrid transfer;
ordinary Node SSR integrations use normal fetch without producing or consuming
replay. After the upstream fix, ordinary SSR/CSR events are expected to commit
through XDA, while hybrid server evaluation retains preflight and browser
commitment. Any flag or automatic selection follows the actual upstream API and
supported integration patterns; no override currently exists. The SDK will not
release until all tracked XDA issues affecting the supported integrations are
resolved and the corrected service behavior is verified.
See [Runtime's canonical XDA contract](./packages/runtime/README.md#xda-preflight-and-profile-finalization)
for replay, identity, consent, queues and lifetime.

Events are consent-gated. Consent is `{ events, persistence }`, where undecided
means not granted. Until event consent is granted only `allowedEventTypes`
(default `identify` and `page`) are sent; the selectors are the Optimization
SDK's (`component`, `component_click`, `component_hover`, `flag`). A blocked
Personalization or Analytics call resolves `{ accepted: false }`, and `onEventBlocked` reports it. Blocked events are dropped,
never replayed, and withdrawing event consent (`consent({ events: false })`) also drops events
already accepted into Web's offline queue. The same gate covers caller-built fetch events and the prepared
handoff batch the browser replays. Node filters consumer-supplied XDA identify/track/page inputs through current consent,
interception and final schema validation. The batch may contain no page; pages are
optional and never synthesized. Web admits a batch that is
already prepared whole or not at all, because it is replayed exactly as the server
previewed it. A refused page-bearing prepared batch falls back to the browser's own gated page
event if it remains eligible under consent, route admission and lifecycle checks.
Admission refusal retains permitted page eligibility; accepted replay is never
resubmitted or followed by fallback solely because delivery fails. Blocked non-page
events stay dropped. Admitted prepared events are re-stamped with the browser's event consent,
not the server's. Node/Web copy the current owner's event consent into admitted
caller-built XDA events' `context.gdpr.isConsentGiven` before interception,
overwriting any caller-supplied flag and leaving caller input unchanged. Node's
request builder also stamps request-local consent. Interceptors may explicitly transform valid metadata,
following direct-event policy; final validation and current-consent admission
still apply. Stateless Client validation/passthrough owns no consent decision.
Web persists consent, always, in LocalStorage (the Optimization SDK's keys and
`accepted`/`denied` encoding, so both SDKs share one decision) and writes the profile
only with persistence consent; configured startup defaults take precedence over
stored decisions and are written to the shared consent keys, and a default that denies
persistence deletes the stored profile; Node scopes consent to one `forRequest()` facade and exposes
`canPersistProfile`. Persistence consent also gates the identity cookie `ctfl-opt-aid`,
which Web writes and a server reads: Web adopts a cookie the browser holds, migrates the
legacy `ntaid`, removes the identity on withdrawal while keeping the in-memory profile,
clears it on `reset()` and not on `destroy()`. Node never touches HTTP; the host reads the
cookie, supplies it through `forRequest({ profile, consent })` and uses `canPersistProfile` to
write or expire the response cookie. The cookie being present is not server-side consent.

Future framework adapters slot in under the same naming pattern: `packages/adapter-vue`, `packages/adapter-swiftui`, `packages/adapter-compose`.

---

Only the actual hybrid Node transfer producer prepares replay. It preserves raw
final Client events, including supported query arrays, unchanged without an
additional replay-compatibility check before XDA. Normal SDK builder XPAPI
validation and Client XDA validation remain; manually built/raw replay retains
consumer-owned compatibility risk. Receiving browser replay checks still enforce
schema/order/count, capacity, scope/cache/consent and lifetime. Refusing replay
does not discard available content. Ordinary fetch retains the wider XDA
contract; ordinary SSR uses normal fetch and has no replay requirement. See [Runtime replay transport limits](./packages/runtime/README.md#replay-transport-limits).

Prepared event attempts publish only after the whole batch is admitted and before
transport begins; refusal publishes none. Preserve the original operation revision
through asynchronous interception and final admission/state publication, so reset,
consent withdrawal, supersession or destroy cannot admit or publish stale visitor work.
Cover these lifecycle and publication rules in maintained tests.

## Parity with the Optimization SDK

Optimization (`contentful/optimization`) is the behavioral reference for submission APIs, queue admission, completion semantics, lifecycle handling, retry and backoff, and configuration. Treat parity as a maintainability requirement: port a fix by following the corresponding Optimization contract, not by adding an alternative result type, fallback or configuration convention. Fetch the named reference branch before comparison and read its current remote-tracking source, not a stale local checkout.

The active parity baseline is Optimization PR #549,
`restore/runtime-preview-after-release`. In the Optimization checkout, run
`git fetch origin restore/runtime-preview-after-release` and read
`git show origin/restore/runtime-preview-after-release:<path>`.
Record the fetched commit when reporting evidence; use this current branch source
rather than main or an older frozen commit.
Web state and subscription mechanics follow that baseline. Web owns module signals backed by
`@preact/signals-core` (`^1.13.0`) and `es-toolkit` (`^1.46.0`), and reactive
persistence, consent, and connectivity effects. Its readonly `states: States`
exposes `profile`, `locale`, `consent`, `persistenceConsent`,
`personalizationRequestState`, `eventStream`, and `blockedEventStream` as observables.
`states.flag(name)` adds key-scoped flag observables through the same utilities.
`preview` uses the same machinery.
`current` and subscription snapshots are cloned except for immutable
`eventStream` references and read-only preview payloads.
Subscriptions are caller-owned; `subscribe` emits the
current value immediately, and `subscribeOnce` stops at the first non-nullish
value, including `false`. Ordinary event attempts stream after validation and
consent and offline capacity admission, before transport; capacity refusal
publishes no event. Attempts never stream on retries or transport completion. Prepared admission emits each accepted
event once and batch refusal emits none. Blocked publication follows `onEventBlocked`. Reset clears
profile, changes, request outcome, and event streams while retaining consent and locale.
Web startup values use `defaults: ConfigDefaults` (`profile`, `changes`, `consent`, and
`persistenceConsent`). Constructor locale and `setLocale()` use the copied
Optimization `normalizeExplicitLocale`/`normalizeLocale` rules; both helpers are
exported by Web. Capture the incoming identity cookie before installing effects.
Install the persistence-consent effect before profile persistence, matching
Optimization, then reconcile the captured cookie after effects are installed.
Internal effects must be disposed on destroy or failed construction before the
singleton is released; late responses must not mutate a replacement instance.
Keep browser signals out of Runtime and Node; Node's profile getter remains
request-local. See the [Web state reference](./packages/web/README.md#state-and-subscriptions).

Web also ports the pinned reference's `InterceptorManager` mechanics through
`interceptors.event` and `interceptors.state`. Events are intercepted before
wire-event revalidation, publication, and transport or queue admission, including caller-built
XDA fetch events; prepared server replay preserves evaluated event contents and
is not rewritten. Incoming Personalization and private hydration profile/changes state
is intercepted before commit; XDA contributes profile and changes through the
same state-interceptor and publication path. Sparse state results
retain omitted fields; explicit `profile: undefined` or `changes: undefined` clears
that field. XDA owns content selection.

The Web entry also exports `./bridge-support`, with
`hydrateOptimizationData(sdk, { profile, changes })`, `CoreBridgeCapabilities`,
`CoreBridgeHost`, and the bridge symbol.
This follows the reference bridge shape for compatible SDK integrations and
supports profile and changes state; it does not expose Optimization's Preview Panel
bridge. Shared state application publishes `personalizationRequestState: success`
atomically with hydration, including profileless hydration. A profileless shared
handoff reports successful hydration while leaving the browser's existing profile
and continuity intact. XDA content fetches do not request or apply this shared
hydration operation.

`hasConsent(name: string)` checks event consent and the allowlist. Configured
`getAnonymousId` runs before profile-id fallback; the default provider reads stored
anonymous identity only with persistence consent. `resolveStatefulDefaults` and
its exported types preserve configured-default precedence and lazy persisted
profile loading. `createSnapshotRuntime`, `ExperiencesRuntime`,
`ExperiencesSnapshot`, and `SnapshotRuntime` are exported from the Web root and
`./runtime` entry. Snapshot runtimes expose static observables, including `flag(name)`,
pure `getFlag`, and inert undefined `preview` state. Event/command methods remain
inert, with no fetch or resolve API. See the
[Web SSR reference](./packages/web/README.md#ssr-import-safety).

Custom flag API behavior uses focused Optimization reference
`c402da2a2ada5cfafebc7f6dd076832c5d1718a5`, whose stateful lifecycle uses runtime
tokens; this does not repin the broader mechanics above. Runtime owns pure
`resolveFlagChange` and base/Node `getFlag(name, changes?)`; only Web retains
changes and automatically attempts exposure. Core emits `plan.personalization`
only when XDA returns a nonempty profile id; it carries the full `profile` and
optional raw XDA changes. Web automatically adopts changes from ordinary by-ID and
destination fetches, as it does direct Personalization responses. Preview Sessions
update in-memory flags without restoring persisted visitor profile/flags; per-call
CPA preview fetches on ordinary instances retain personalization only on the plan. Supplied arrays
replace the browser snapshot (`[]` clears); omission retains flags unless profile
identity changes. Treating XDA changes as a complete snapshot follows
XPAPI/Optimization and remains an assumption pending live-backend verification.
Changed values notify subscriptions; changed attribution refreshes exposure.
Guard asynchronous state interception so stale results cannot overwrite later
state. Node carries returned changes alongside profile in private handoffs without
retaining global flag state. Applications can still read plan changes explicitly
or resolve them into existing metadata; keep flag state out of renderer context
and framework hooks. Handoff changes use
API `ChangeArray` validation and require private-request scope, including `[]`.
The changes signal stays internal; the public `Signals` interface and `signals`
aggregate expose no mutable changes member. Use flag reads/observables and the
guarded bridge or handoff ingestion paths.
See the [Web flag contract](./packages/web/README.md#custom-flags).

A difference is justified only when the content sources and their properties require it, or when server-side personalization here replaces client-side variant resolution there. A retained difference names that requirement. Existing code and new documentation are not a justification.

Retained differences:

- The changes signal stays internal, deliberately differing from the focused
  Optimization reference's public mutable extension surface. No current supported
  consumer requires that new member; guarded bridge/handoff ingestion and flag
  reads/observables suffice and keep flag state SDK-owned.
- Automatic flag exposure quietly skips preview and missing profiles. Consent
  refusals follow Optimization through normal blocked-event reporting. Active
  subscriptions retry when changes, profile, or consent changes, including
  allowlisted exposure.
  `getFlag()` and `states.flag(name).current` track flag-value dependencies while
  exposure runs untracked, preventing event interceptors or subscribers from
  adding unrelated dependencies to the caller's reactive computation. Untracked
  exposure is a local difference from the focused Optimization reference.
- The pinned `CoreStatelessRequest.prepareRequestHandoff` previews through XPAPI.
  Experiences retains `fetchExperienceForHandoff` because XDA must evaluate the
  consumer-supplied batch and select content; XPAPI remains actual commit transport.
- SSR/CSR XDA-carried events remain uncommitted pending upstream force-commit
  support. The content source requires XDA evaluation; the SDK adds no commit
  workaround or current force flag. Only actual hybrid server-supplied browser
  replay commits. This difference does not establish full commit parity.
- The pin retains only current Web initialization identity. Experiences retains
  accepted replay identity across newer initialization: serialized A after B is
  refused without state/event republication or recommit for page/nonpage batches.
  The user's once-owner/XDA batch contract requires this owner-lifetime admission
  history. New visitor/actions need fresh message IDs; reset/destroy clear history,
  while consent withdrawal never restores accepted or blocked replay intent.

- The XDA aggregate preserves caller-built event intent: identify/track-only
  replay permits an optional single final page, and replay-less consumption emits no
  page without explicit `buildPayload`. The pin's `hydrateAndTrackCurrentPage` requires
  a final page and defaults absent/nonmatching replay to ordinary page tracking.
  XDA consumers explicitly supply evaluation events, so adding page intent would alter
  their requested evaluation/commit. Necessary state application remains internal to
  the full aggregate operation; React provider/root consume `handoff` directly.

- Experiences omits `onOfflineDrop`. The active Optimization baseline retains it
  only as an inactive deprecated callback. Both refuse ordinary offline overflow
  before event publication, without eviction, and admit prepared batches whole
  or refuse them without publication.
- Experiences preserves active interaction intervals on repeated `enable` calls
  with unchanged effective options, and lets dynamic element attributes opt in
  even when automatic tracking is disabled. The baseline still restarts on repeated
  enable and gates attribute opt-ins on automatic tracking being enabled.
- Experiences `reset()` clears manual overrides and old measurements, resets
  visitor state and the owner's token, then immediately resumes eligible automatic
  and attribute discovery with fresh intervals while retaining tracking configuration.
  The baseline stops detectors on reset. Both guard pending timed interactions
  with owner reset tokens and restart permitted interactions on consent withdrawal.
- Experiences ordinary `flush()`, reconnect and visibility handling await Analytics
  before Personalization. The active baseline starts both attempts independently;
  its `flushQueues()` awaits them with `Promise.all`. Preserve the current
  Experiences order without attributing it to the baseline.

Shared safeguards in the active baseline must remain in Experiences:

- Dispose internal effects on destruction or failed construction before releasing
  ownership; guard late responses so an old owner cannot write replacement state
  or persistence. Application subscriptions remain caller-owned.
- Reset and event-consent withdrawal purge queues and invalidate in-flight state
  publication. Analytics and Personalization use lifecycle/reset guards, preventing
  an old visitor's response from restoring cleared state or continuity.
- Complete event-consent withdrawal in one reactive batch before subscribers run.
  Persist explicit browser consent decisions before subscribers can destroy the SDK
  and dispose persistence effects.
- Start both final destruction flush attempts independently before ending the live
  lifetime. Personalization's `flushOnDestroy()` captures teardown identity and joins
  the common drain, following only its own response identities and cleaning up its
  teardown authorization. Final sends remain best effort and cannot publish into
  a replacement owner.
- Run subscription snapshots and callbacks untracked. Report synchronous event-stream
  subscriber errors without interrupting delivery or prepared admission bookkeeping;
  errors from other observables still propagate. Keep post-publication lifecycle checks.

Prepared replay is present in the active Optimization baseline. Experiences adapts
it to XDA evaluation rather than local selected-optimization resolution. Assess
parity against mechanics and retained content-source differences; matching state
names or test outcomes alone does not establish lifecycle parity.

---

## Architecture in 60 seconds

The customer pipeline is three steps:

```
fetchExperience(experienceOptions, clientOptions, resolveOptions) → <ExperienceRenderer experience={…} />
```

`fetchExperience` is the **single async entry** for most customers — it fetches the payload from the Destinations Delivery API (by destination path or node id, the recommended path for apps) or the Experience Delivery API (by Experience id) and calls `resolveExperience` internally. The three positional args group by concern: **which experience**, **how to fetch**, **how to resolve**. Each grouping evolves independently — a shape chosen to avoid one flat options object growing unbounded.

The existing free `fetchExperience` and framework-adapter path remains separate
from runtime construction. Customers who want to manage a delivery client there
have two paths: `createClient({ accessToken, spaceId, environmentId, host? })`
(functional constructor, our option shape), or
`new ContentfulViewDeliveryClient({ token, spaceId, environmentId, baseUrl? })`
(underlying delivery client, its option shape). Either way, pass the resulting
client as `{ client }` in `clientOptions`. That caller-supplied client branch is
not accepted by the Node or Web runtime constructors.

`resolveExperience` (called internally by `fetchExperience`) is the **resolve step**:

1. Walks the XDA payload's `nodes[]` recursively.
2. Extracts each node's id from whichever ref it carries — `component.sys.urn` or `experienceTemplate.sys.urn` (last slash-segment) — and records which one in `node.registration.kind`.
3. Splits `contentProperties` and `designProperties` into `node.props`, resolving design values and tokens for renderer-facing `props.design` while retaining raw envelopes in `props.designRaw`.
4. Captures `slots` as nested `PortableRenderNode[]` arrays (no flat index).
5. Runs every customer-declared `resolveData` hook in parallel; results land on `node.props.resolved`.
6. Returns a `PortableRenderPlan`.

`payload.sys.experienceTemplate` is **never read**. It is `required` on every Experience — a composite one names its template there too — so it carries no coded-vs-composite signal. The node list is the signal: a coded Experience Template shows up as a node whose ref is `experienceTemplate`, a composite one as plain `component` nodes.

The plan is **runtime-neutral** — no React, no DOM, no platform assumptions. Every framework adapter consumes the same plan.

The React adapter then:

1. Builds a `RenderContext` with `{ debug, metadata }`.
2. Walks the plan top-down, pre-rendering slot subtrees as ReactNodes.
3. For each node: looks up the customer's config by `node.registration.id`, against `config.experienceTemplates` when `registration.kind === 'experienceTemplate'` and `config.components` otherwise. It publishes the token-resolved design record on context for `useDesignValues()` / `getDesignValues()`, and merges it into the final props: `defaults < design < content < resolveData < slots`. Components style themselves from those props — that is the one recommended styling contract. The design hook (and `toCss`) is an escape hatch for nested children that aren't registered components and for design needed outside the render path.
4. Injects one prop per slot the node carries, named after the slot and holding an array (`ReactNode[]` / `Snippet[]`) — `children` is just the conventional name for the default slot, not a special case. Both node kinds get this identically.

An unregistered id degrades rather than blanking the page: a **component** node renders `renderUnknown` (the missing-component box), a **template** node warns and renders its slot children unwrapped.

---

## Design decisions worth knowing

### Why three positional args on `fetchExperience` instead of one options object?

`fetchExperience` carries three concerns at once — fetch, resolve, and per-render context — and takes several kinds of inbound input (Experience ids, destination paths and node ids, personalization). A single flat options object would mix all three into one bag of a dozen-plus fields, so the signature is split into three grouped args:

1. `personalizationOptions` — **which** experience. A union discriminated by key presence (`nodeId`, then `path`, otherwise the by-id shape), with one overload per member:
   - **By destination path** (recommended for apps) — `{ spaceId, destinationId, path, personalization? }`, where `path` is absolute and starts with `/`.
   - **By destination node id** — `{ spaceId, destinationId, nodeId, personalization? }`.
   - **By Experience id** — `{ spaceId, environmentId, experienceId, locale?, parameters?, personalization?, extensions? }`. Returns `PortableRenderPlan`. The secondary route: use it when you already hold an id, and for preview and live preview, which Destinations do not support.

   The destination shapes are space-scoped only: no `environmentId`, `locale`, `parameters`, or `extensions` (`personalization` is supported). They return `PortableRenderPlan | DestinationRedirectResult`, because a Destination redirect node resolves to `{ redirect: { path } }` — returned as a value, not thrown. Callers navigate to the new path or re-call `fetchExperience` with it.

2. `clientOptions` — **how** to fetch. Discriminated union: `{ accessToken, host? }` OR `{ client }`. Kept intentionally as one arg (not split further) so users can move between inline creds and a pre-made client with only that arg changing.
3. `resolveOptions` — **how** to resolve (`config`, `metadata`, `debug`). Personalization is _not_ here — it rides on `experienceOptions.personalization`, for both the by-id and destination shapes.

Each grouping evolves without touching the others.

### Destinations: fetch by path, enumerate with the sitemap

A Destination (an instance of a Channel) maps paths to Experiences through its nodes. Two entry points, both free functions in `packages/client` and re-exported by every framework adapter:

- `fetchExperience({ spaceId, destinationId, path | nodeId }, …)` resolves **one** path or node.
- `fetchDestinationSitemap({ spaceId, destinationId }, clientOptions, { limit?, pageNext?, pagePrev? })` lists **every** routable path as `{ items: { path, experienceId, type }[], limit, pages: { next?, prev? } }`. `limit` defaults to `100` (max `1000`); cursors are opaque, and `pageNext` and `pagePrev` must not be combined. It does not hydrate Experiences and never calls `fetchExperience`.

The sitemap exists for bulk enumeration — static generation / prerendering (feed each `path` to `fetchExperience`), `sitemap.xml` generation, and any other need to walk a Destination's routes. Prefer resolving by `path` over passing a sitemap item's `experienceId` to the by-id shape: by-id skips the Destination tree lookup, and with it the redirect and consistency behavior of the Destinations API.

**Preview is not supported for Destinations yet.** With inline credentials, `preview: true` plus a destination (in either function) throws `DestinationPreviewNotSupportedError`, re-exported by every adapter. The guard (`destination-guards.ts`) is a bridge, not a permanent design; it does not fire on the `{ client }` branch. The Node and Web runtimes expose per-request destination fetches (`fetchByDestinationNode` / `fetchByDestinationPath`), but `fetchDestinationSitemap` is a free function only — there is no sitemap method on either runtime.

**Examples are destinations-first.** The framework examples (`examples/nextjs`, `sveltekit`, `angular`, `astro`, `vite-react`, and `vite-svelte`) resolve the URL path against a Destination (`DESTINATION_ID`, printed by the bootstrap for you to paste into the example's env file) and fetch by Experience id only at `/experiences/[id]`. Preview lives on that route in the server-rendered examples; the client-only Vite examples have no preview. Destination delivery is master-only and space-scoped, so `ENVIRONMENT_ID` affects only the by-id route. The Next.js, SvelteKit, and Angular examples also show a demo hub at `/` (the route list and the `?personalization` and `?debug` options) above the home node.

### Why does `fetchExperience` have both `preview: boolean` and `host: string`?

This describes the unchanged free `fetchExperience`/adapter path, not the
Node/Web runtime constructors. `preview` is the ergonomic toggle: pass both
`accessToken` and `previewToken` once, then flip `preview` per call to pick the
token and default host (`DELIVERY_HOST` vs `PREVIEW_HOST`) without touching
either token. `host` is the escape hatch for URLs neither default covers —
staging, a proxy, a per-region endpoint — and wins over both the generated
client's `environment` endpoint option and the `preview`-derived default
(`host: 'https://staging.xdn...' , preview: true` targets a non-prod preview
endpoint). When `host` is absent, an explicit generated-client `environment`
wins over the delivery/preview default. The `{ client }` branch ignores
`preview` entirely; a caller-supplied client owns its own base URL.

### Why does every delivery request carry `x-contentful-enable-alpha-feature: new-exo-entity-types`?

The Experience Delivery API gates the entity shapes this SDK reads behind that header — nodes linking `component` (`Contentful:Component`) and `experienceTemplate` (`Contentful:ExperienceTemplate`). A request without the header returns a different shape, which the SDK does not parse. There is no fallback and no normalization layer, so the header is load-bearing rather than optional.

The generated `@contentful/experience-delivery` client sends it itself, defaulting to `new-exo-entity-types` in both `normalizeClientOptions` and every generated resource method. That covers all three entry points — `fetchExperience`, a `createClient` client, and a raw `ContentfulViewDeliveryClient` a customer constructs — so `packages/client` does not set the alpha header. The one header it does set is `X-Contentful-User-Agent` (see below).

### Why does `createClient`/`ContentfulViewDeliveryClient` now require `spaceId` and `environmentId`?

`@contentful/experience-delivery@1.0.0-dev.13` moved `spaceId`/`environmentId` from
per-call arguments on `client.experience.*`/`client.destination.*` (e.g.
`client.experience.get(spaceId, environmentId, id, opts)`) to required fields on
the generated client's constructor options (`client.experience.get(id, opts)`).
`packages/client`'s `resolveDeliveryClient` and `packages/runtime`'s
`createRuntimeDeliveryClient` both construct the generated client per call now,
threading an explicit `identity: { spaceId, environmentId }` through from the
caller's `personalizationOptions`/`Config` so inline-credential
clients still get built with the right values. A caller-supplied `{ client }` or
`new ContentfulViewDeliveryClient({...})` must now also pass `spaceId`/
`environmentId` at construction — it can only serve that one space/environment
afterward. Destination calls have no environment, so that path threads
`environmentId: undefined` through (the generated client still requires the
field; `packages/client` passes an empty string).

The same spec refresh requires `context.campaign`, `originalTimestamp`, `sentAt`,
and page-event `properties.title`. Screen events require `name` and
`context.screen`. Track properties and identify traits are required records;
screen properties are optional. Their recursive generated value types exclude
`null`. Client's `PersonalizationOptions` is the generated request type directly,
without widening or request casts. Runtime keeps newly built events separate from
validated XDA events so interception still runs before final validation; values
allowed by the direct Optimization transport must also satisfy XDA's contract
when included in an XDA fetch. Derive property/trait types through the named
request types rather than referencing generated auto-named schema types directly.

### How does the SDK report its version?

Every Delivery and Preview request carries `X-Contentful-User-Agent`, the header `contentful.js` and `contentful-management.js` send, built by a copy of `getUserAgentHeader()` from `contentful-sdk-core` in `packages/client/src/user-agent.ts`. It is copied rather than imported so `lodash`, `qs`, `fast-copy`, and the `process` polyfill stay out of the browser bundle; keep the format in sync with upstream. `packages/client` owns the builder (`createUserAgentHeaders`). The Node and Web runtimes report the leaf package plus the configured `app`, e.g. `app my-site/1.0.0; sdk experiences-node/0.6.0; platform node.js/v22.17.0; os macOS/v22.17.0;`. `createClient`, and the free `fetchExperience` path that uses it, report `sdk experiences-client/<version>`. A caller-supplied `headers` entry with the same name wins. A raw `ContentfulViewDeliveryClient` sends nothing. Event payloads keep reporting `context.library`; the header does not replace it.

Package versions come from the `RELEASE_VERSION`/`package.json` build defines, so source and test runs report `0.0.0`. Both release workflows run `scripts/release.ts`, which writes versions, rebuilds every package without the cache, and runs `verify-release-artifact` before anything is committed, tagged, or published. The restored build-job folders still embed the previous versions. Recovery steps are in CONTRIBUTING.md. Both XDA hosts allow the header in CORS preflight. A customer proxy has to allow it as well.

One sharp edge in the generated merge order: `mergeHeaders(authHeaders, this._options.headers, <per-request default>, requestOptions.headers)`, later wins. The per-request default lands **after** client-level `headers`, so a `createClient({ headers: { 'x-contentful-enable-alpha-feature': … } })` entry is silently clobbered. Only `requestOptions.headers` (or `requestOptions.xContentfulEnableAlphaFeature`) can override it. Do not document client-level `headers` as an override path for this key.

The delivery client types `GetExperienceResponse` as a union of the shapes the endpoint can return, because the generator can't know which header was sent. `fetch-experience.ts` narrows to `HydratedExperienceView` by hand — the cast is sound because the generated client guarantees the header.

### Why `createClient` in addition to the raw `ContentfulViewDeliveryClient` constructor?

`createClient` is a value-added passthrough that maps the SDK's option names (`accessToken`, `host`) onto the underlying client's names (`token`, `baseUrl`). Everything else flows through unchanged. It exists so the "inline creds" and "bring your own client" paths of `fetchExperience` share exactly the same field names — users can move between them mechanically instead of relearning vocabulary.

`fetchExperience`'s own inline-creds branch routes through `createClient` — single source of truth for the name mapping. If we ever add auth flavors beyond bearer-token, this is where they'd land.

### Why an empty-nodes payload is NOT a "not found"

Returning `null` for a payload with `nodes: []` would conflate two states the CMS considers distinct:

- **Experience doesn't exist** (404 from the delivery API) — the delivery client throws `NotFoundError`. Caller should route to their framework's 404 idiom.
- **Experience exists, empty content** (200 with `nodes: []`) — draft, unpublished, empty locale fallback, editor-in-progress. Legitimate CMS state; renders as an empty page.

So an empty-nodes payload flows straight through to `resolveExperience`, which handles it gracefully (no walker iterations, the Experience Template still resolves if present, returns an Experience with `nodes: []`). `fetchExperience` returns `PortableRenderPlan`, never `null` (the destination overloads may instead return a `DestinationRedirectResult`, which is a redirect to follow rather than an empty Experience).

For the missing-experience case, `NotFoundError` is re-exported from the adapter (via `packages/client`) so example call sites can wrap `fetchExperience` in try/catch and use the adapter's dependency on `@contentful/experience-delivery`.

### Why a single `resolveExperience` entry instead of `buildPlan` + `resolveExperience`?

Two functions would cost the customer page three lines of imports, four function calls, and two passes of `componentMap`. One entry point avoids that. The sync vs async distinction (tree-walking is synchronous; `resolveData` hooks are async) is implementation detail customers don't care about.

### Why does `ctx.design` retain raw envelopes inside `resolveData`?

`resolveData` receives the `ManualDesignValue` / `DesignToken` envelopes exactly as delivered, so a resolver can distinguish editorial literals from token references. The renderer receives the corresponding token-resolved values through `props.design`. Resolvers run once while the plan is built and do not receive render-time state.

### Why JS-at-render-time for design properties (not CSS variables)?

Pros of CSS-vars output: best perf, real responsive design (works without JS), accessibility win.
Pros of JS-at-render-time (current default): handles non-CSS values (booleans, control-flow), customer components stay vanilla React (no `var(--foo)` boilerplate), works for every framework adapter the same way.

Going JS-first; CSS-vars opt-in is a future feature flag (`defineComponent({ design: 'css' | 'runtime' })`).

### Why no auto-generated node IDs?

The XDA payload sometimes carries `node.id`; when it does, we pass it through as `node.nodeId` on the IR. When it doesn't, `node.nodeId` is `undefined` and React keys fall back to array index, missing-component warnings omit the id. Generated IDs would not provide stable references for customers.

### Why is `Server` separate from `Client` instead of one component?

React's RSC compilation requires a `'use client'` directive at the top of files using hooks. A single component can't both be importable from a server component AND use `useEffect`/`useState`. Two files is mechanically forced; the customer-facing API is two symbols (`ServerExperienceRenderer` for SSR, `ClientExperienceRenderer` aliased as `ExperienceRenderer` for client-side editor mode).

### Why does the customer's `experience-config` use the design-system's own `*Props` types?

Each `defineComponent<Props>(...)` is parameterized over the design-system component's prop type. No separate `ContentfulButtonProps` interface to keep in sync. The design system owns the contract; the integration layer adapts to it. When a Contentful payload field doesn't map 1:1, the customer either (a) renames at the render-fn call site, or (b) uses `resolveData` to reshape, or (c) extends the type at the map level (`type ButtonMapProps = ButtonProps & { testSlot?: ReactNode }`).

### Why is the delivery client (`@contentful/experience-delivery`) isolated in `packages/client`, not a direct dep of the adapters?

Two reasons. (1) `packages/core` must stay zero-dep and runtime-neutral — pulling the delivery client into core would break that invariant for all current and future adapters. (2) The delivery client is large (~3,000 generated files); centralizing it in one internal package (`packages/client`) means adapters that don't need it (e.g. a future server-only adapter) won't pull it in transitively. Customers who want to manage the client themselves can import `ContentfulViewDeliveryClient` directly from the adapter and call `resolveExperience` with their own payload.

### Why two separate registries (`components` and `experienceTemplates`) instead of one?

They are **separate id namespaces in the payload**. A node links either a `Contentful:Component` or a `Contentful:ExperienceTemplate`, and nothing stops the two entity types from sharing an id — so a single flat map could collide, with no way to tell which entry a node meant. The payload already says which namespace applies (`node.component` vs `node.experienceTemplate`, carried into the IR as `registration.kind`), so the renderer picks the registry from the node rather than guessing.

Note that the _render fns_ are not structurally different — a coded Experience Template is an ordinary node whose slots arrive as named props, exactly like a component's. The split is about id resolution, not about templates being special.

### Why is `nodeId` optional on the IR but `registration` required?

The payload's `id` field is optional from XDA. Without one, the SDK never invents an id (see "no auto-generated node IDs" above). But every node MUST resolve to a registered type — the payload always provides one of `component.sys.urn` / `experienceTemplate.sys.urn`. Treating `registration` as required lets the renderer dispatch reliably.

The `registration` object exists as a seam for future capabilities/metadata the Component Domain Model RFC describes (state requirements, supported events, lifecycle hints, fallback ids). Today it's just `{ kind, id }`; later it grows additively without breaking the IR.

### Why do `Components` and `ExperienceTemplates` use `<any>` internally?

```ts
export type Components = Record<string, ComponentConfig<any>>;
export type ExperienceTemplates = Record<string, ExperienceTemplateConfig<any>>;
```

Per-entry prop narrowing happens at `defineComponent<Props>(...)` call time, not at registry-lookup time. The renderer dispatches by string key — at that point, the per-component prop type has been erased anyway. Using `any` here is intentional: it's the only way to compose differently-typed entries into one record without forcing customers to wrap entries in a discriminated union.

---

## Conventions

### Commit messages

Keep changes unstaged during implementation and review. Stage only for a ready commit explicitly requested by the user, or an explicit staging request. Commit only when the user requests it.

Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, etc.). Enforced via `commitlint.config.js` + `.husky/commit-msg`. **`feat:` and `fix:` trigger version bumps via `nx release`. `chore:` does NOT trigger a release.**

**Alpha version bump behavior**: `nx.json` sets `version.adjustSemverBumpsForZeroMajorVersion: true`, which applies SemVer V2 semantics for 0.x versions. While packages are on 0.x:

- `feat!` / `BREAKING CHANGE:` → minor bump (e.g., `0.4.0` → `0.5.0`), NOT major
- `feat:` → patch bump (e.g., `0.4.0` → `0.4.1`), NOT minor
- `fix:` → patch bump (unchanged)

Packages stay under `1.0.0` no matter what commit types land. **Remove this setting from `nx.json` when we're ready to ship 1.0.0 GA**

### Package boundaries

- **`core` has no dependencies.** It may not depend on `react`, the delivery client, or any framework-specific package. It owns runtime-neutral payload/plan types, resolution, diagnostics, and design-resolution support. Enforced by code review (no module-boundary lint rule yet, but it should land).
- **`design` owns CSS-property helpers.** Its `CSS_PROPERTIES`, `isCssProperty`, and `toCssKey` exports support the adapters' `toCss` helper. Core owns design-value and token resolution.
- **`client` is the only package that may depend on `@contentful/experience-delivery`.** All delivery-client usage must go through `packages/client` — never import it directly from an adapter, from `core`, or from the public Node or Web SDK. Live Preview remains independently configured in its own package.
- **`client` owns Delivery and free functions; `runtime` owns event construction and orchestration.** Client retains generated-XDA-derived request types, payload conversion, errors, and `fetchExperience`. Runtime depends on Client's public exports, never the generated dependency directly. Client never imports Runtime or forwards `EventBuilder`. Runtime owns the complete builder implementation, schemas, defaults, metadata, identity constants, Optimization transport, direct event methods, and lower-layer shared runtime. Node/Web runtime constructors take `DeliveryClientOptions`, then construct and retain their own Delivery, optional Preview, and Optimization clients; they never accept caller-created delivery clients. The base exposes the Optimization service clients as readonly `api` (`api.personalization` and `api.analytics`) and retains its typed leaf config as readonly `config`; Delivery and Preview clients remain private. Web exposes its queue references, allowlist, blocked-event callback, and connectivity accessor as protected extension points; browser lifecycle and state internals remain private. A token may be a supplier, or may be omitted only with an explicit proxy host, which disables generated auth and must own upstream authentication. The runtime never retains request or browser state. `packages/node` is the public request-scoped leaf. Its direct methods remain callable without an initial prerequisite or compensation. The request facade retains volatile profile/event context; Runtime owns no request journal. Ordinary SSR/CSR fetch owns construction once, while only actual server-to-browser transfers produce optional incoming replay. Same-ID Retry and later reference comparison IDs use ordinary event-free fetch. Browser consumption remains independent of display; pinned continuity selection, consent, queue and lifetime guards remain required. See [Runtime's XDA contract](./packages/runtime/README.md#xda-preflight-and-profile-finalization). Admission, `identityReady`, `flush()` resolution, generic SDK success, state hydration, LocalStorage, and cookies are not proof of commit. See [XDA preflight and profile finalization](./packages/runtime/README.md#xda-preflight-and-profile-finalization). It persists its current profile in LocalStorage only once persistence consent is granted. Consent is a `{ events, persistence }` state, undecided meaning not granted: Web holds it globally and always stores it in LocalStorage, while Node scopes it to one `forRequest()` facade and never persists it. Without event consent only `allowedEventTypes` (default `identify`, `page`) are sent. It uses Runtime's in-memory Personalization sender for offline ordinary events and prepared batch admission. Handoffs are browser-visible exact event bodies; safely escape them into private/no-store responses, exclude secrets/server-only traits, and never cache, log, or persist them. Prepared replay has no durable queue or exactly-once guarantee. `identify`, `page`, and `track` use the Personalization API; `trackView`, `trackClick`, `trackHover`, and `trackFlagView` use Analytics. Web queues Analytics events in memory and flushes them at 25 events, every 30 seconds, on reconnect, and on page hide with `navigator.sendBeacon`, while Personalization gets its own forced attempt; `flush()` awaits Analytics before Personalization and joins an active Analytics flush. `queuePolicy.offlineMaxEvents` (default 100) caps offline Personalization admission, separately from the per-handoff payload limit. Node sends immediately. Runtime eager event validation follows Optimization's intercept-then-validate order, with `trackView` preserving the early consent check before view validation. `BlockedEvent.method` is a string, matching Optimization's public type. All seven event methods return `EventEmissionResult`; consent or destroyed-Web refusals resolve `{ accepted: false }`. Analytics acceptance does not report transport success. Without a complete profile Web warns and drops the Analytics event, while Node throws `EventProfileRequiredError`. ID-only Node request profiles remain valid for Personalization and content continuity. `forRequest()` accepts `personalizationOptions` (`ip`, `plainText`, `locale`) and `analyticsOptions` (`beacon`), copied per request. `personalizationOptions.locale` is only the Personalization transport and replay locale; the content locale comes from `forRequest({ locale })` or the constructor. There is no durable event persistence. Session preview suppresses all runtime events. Automatic Web interaction tracking is browser-only and sends through the Analytics methods, so it uses that queue. Direct CPA fetching is distinct from the Preview Session HTTP/WebSocket functionality owned by `packages/live-preview`; Session preview suppresses manually invoked methods before building or profile lookup. The separate adapter/free `fetchExperience(..., { client })`, `createClient`, and raw `ContentfulViewDeliveryClient` paths remain supported. See the root [paired replay guide](./README.md#paired-server-to-browser-replay).
- **One live Experiences Web SDK per JavaScript runtime.** Web owns a `globalThis` lock and releases it on construction failure or idempotent `destroy()`, after stopping active interaction observers and disposing internal state effects. The shared Runtime base and Node SDK do not acquire that lock; independent Node instances may coexist, and `forRequest()` facades remain request-local views of their own Node instance. Experiences Web and Optimization Web are alternative product SDKs; consumers must not run both on the same page. The SDKs do not coordinate their locks or profile storage.
- **The customer-facing adapter (`adapter-react`) owns the SDK-wide re-exports.** The `live-preview` package has its own customer-facing entry point. Internal packages keep their exports in their own entry points.

**Consequence for `core`'s payload types.** Because `core` stays zero-dep, its payload-facing types (`ExperienceNode`, `ComponentNode`, `ExperienceTemplateNode`, `ComponentRef`, `ExperienceTemplateRef`, `ExperienceSys`, `ExperiencePayload`) are **hand-mirrored** from `@contentful/experience-delivery` rather than imported from it. Each carries a doc comment naming its upstream counterpart (`RenamedComponentTreeNode`, `ComponentLink`, `RenamedDeliveryExperienceSys`, …). They're deliberately structural supersets — a few upstream-required fields are optional here so `resolveExperience` also accepts hand-authored payloads — which is why `fetch-experience.ts` can assert a delivery response straight to `ExperiencePayload` with no normalization step.

**When the delivery SDK regenerates, re-check that mirror.** `packages/core/src/types.ts` is the only place it lives; `client:typecheck` is what catches a drift, because that assertion stops compiling if the shapes diverge.

### File naming

- React components in design-system + adapter packages: `PascalCase.tsx`
- Non-component modules: `kebab-case.ts(x)`
- Tests: `<source>.test.ts(x)` next to the source

### Tests

Add focused maintained unit/contract cases at the owning layer. Cover optional-page ordering,
nonpage replay without fallback/route marking, replay-less internal state and explicit
page intent, aggregate ownership, consent/preview/schema, content failure, event-free same-ID
Retry without repeated hooks/events/commit, and reset/destroy/supersession.
Verify React `handoff` prop/exports and complete-operation lifecycle with current route.
Lifecycle consumes the complete operation using the current browser route.
Managed source/presentation controllers use XDA-built events without mandatory
direct `beforeInitialPage` emission. Preserve
Optimization's page consent-retry exception in the managed flow; do not
automatically replay blocked non-page events after grant.

Vitest. Tests live next to source (`src/foo.test.ts`). The `node` environment is fine for everything (we use `react-dom/server` for renderer tests — no jsdom needed).

### Build

The `core`, `client`, `runtime`, and `web` packages bundle dual ESM and CJS
entries and emit paired `.d.mts`/`.d.cts` declarations through
`scripts/emit-dual-dts.ts`. Node and the framework adapters remain ESM and keep
their current output formats. Keep the React adapter's `'use client'` source
directives intact; its current build remains unbundled for RSC compatibility.

Only Web uses Rslib, following Optimization's ESM/CJS/UMD configuration pattern.
Its UMD builds directly from `src/contentful-experiences.ts` and exposes the
`ContentfulExperiences` constructor. Web emits per-file declarations so shared
types retain their identity across public subpaths; the dual-declaration helper
preserves the package's existing type entry paths. Other package builders remain
unchanged. Rslib's generated `packages/web/.rstack/` directory is disposable.

---

## Gotchas

### Generated files and caches are disposable

- Treat reproducible generated code, assets, build outputs, caches, and installed dependencies as disposable. Preserving unrelated work means preserving authored source and data, not stale generated artifacts.
- When build, test, typecheck, or module-resolution failures plausibly involve stale generated state, clear the relevant generated directories and regenerate early. Do not repeatedly retry against the same suspect cache, archive disposable outputs for safekeeping, or introduce source/configuration workarounds just to preserve them.
- This includes `.nx/`, `packages/*/dist`, `out-tsc/`, `*.tsbuildinfo`, example `.next/`, `.svelte-kit/`, `.angular/cache/`, generated bundles, and coverage output. Remove an accidental package-local dependency installation when it interferes with workspace resolution; restore dependencies using the repository's existing package manager and lockfile.
- Routine scoped cleanup and regeneration within the authorized repository requires no additional user confirmation. Coordinate with active builds or other agents using the same outputs, then clean and rebuild in dependency order.
- Ignored does not by itself mean disposable: preserve `.env` files, credentials, local databases, user-created assets, and other non-reproducible data. Avoid blanket `git clean -fdx`; delete known generated paths explicitly. For tracked generated files, fix the source/generator and regenerate through the maintained workflow.
- After a clean rebuild, investigate a persisting failure using its actual diagnostics. Do not label a cache as corrupt or claim a product limitation merely because disabling caching changes the result.
- Keep resolved local cache/build blips out of PR descriptions. Report final validation and only unresolved limitations that materially affect review confidence or reproducibility; keep machine-specific troubleshooting in the local conversation when needed.

### `'use client'` preservation

Tsup strips the directive when bundling. We use `bundle: false` per package, which keeps each source file's directive intact in the dist output. **Don't change to `bundle: true` without a replacement plan** — Next.js will refuse to import client-side hook code from a server component.

### Hooks must be in a file with `'use client'`

`client-renderer.tsx` starts with `'use client'`. If you add a new file using React hooks, **it needs the directive**. Otherwise Next.js's RSC analyzer will complain at build time even if the import is technically correct.

### `@types/react` deduplication

Next.js 15 pins `@types/react@19`. Our root devDep is also `@types/react@19`. Mixing versions across the workspace (e.g. one package with `^18`) caused `LayoutProps` constraint failures in the example app. **All packages should align on the same React types version.** Currently 19.

### Experience Template URN extraction shares logic with components

Both Component and Experience Template URNs use the same path shape:

```
crn:contentful:::experience:spaces/$self/environments/$self/{components|experienceTemplates}/<id>
```

`extractIdFromUrn(urn)` takes the last slash-segment for both. If Contentful changes the URN format upstream, fix it in **one place** in `core/src/resolve-experience.ts`.

### `examples/nextjs/lib/experience-config.tsx` is `.tsx` not `.ts`

It returns JSX (the render fns). The compiler picks up the `tsx` extension; importing the `tsx` file into `app/[...path]/page.tsx` works because Next resolves both extensions.

### `next-env.d.ts` is gitignored

Next regenerates it on every `next build`. It's in `.gitignore`. If you see lint complaining about it, you've accidentally tracked it — `git rm --cached`.

### Nx cache + tsup builds

`build.yaml` saves `packages/*/dist` to a run-scoped cache; `check.yaml`, `release.yaml` and `prerelease.yaml` restore it. **The cache key is `build-cache-${run_id}`** — retries of the same run reuse its completed build, including when only a failed downstream job reruns. Across runs, Nx's local content-hash cache (`.nx/`) handles incremental work. Keep the cache path and key consistent across the save and all restore steps.

### Publishing

Packages publish to **GitHub Packages**, and org infrastructure mirrors to npmjs.org via trusted publishing. This matches every other Contentful monorepo (`mcp-server`, `rich-text`, `field-editors`, `live-preview`, `apps`, etc.). Auth is Vault-provisioned `GITHUB_PACKAGES_WRITE_TOKEN`. The `nx-release-publish` target in `nx.json` pins the registry to `https://npm.pkg.github.com`.

**One-time bootstrap per package**: on first release of a new package name to GitHub Packages, a manual `npm publish` to npmjs is required to establish the package there so the mirror can pick it up on subsequent releases. See `contentful/contentful-experience-delivery.js/RELEASING.md` for the runbook.

### Nx project name vs npm package name vs folder

These three CAN diverge:

- Folder: `packages/adapter-react`
- Nx project name: `adapter-react` (in `project.json`)
- npm package name: `@contentful/experiences-react` (in `package.json`)

Renaming the folder needs all three updated. Cross-reference: `project.json#sourceRoot` (`packages/adapter-react/src`), `project.json#targets.*.options.cwd` (`packages/adapter-react`), and `package.json#repository.directory` (`packages/adapter-react`).

---

## Things known to be deferred / incomplete

### Design tokens

Customer-supplied resolver for `DesignToken` envelopes. The SDK resolves tokens while building the plan; unresolved tokens are retained in the renderer-facing record and produce a diagnostic. Future `defineTokens([...])` API will let customers declare resolvers (theme + brand + channel).

### Capabilities on `node.registration`

The Component Domain Model RFC describes `registration: { capabilities: { state, slots, events, lifecycle, rendering } }`. Today we only have `{ componentId }`. The seam exists; the fields are additive when capabilities ship.

### Composite component types

An editor-authored ("composite") Experience Template arrives as plain `component` nodes at the root — no wrapping `experienceTemplate` node at all. Covered by tests (`resolve-experience.test.ts`'s `compositePayload` cases, `server-renderer.test.tsx`'s "renders a composite experience unwrapped" case).

### Fragments

`@contentful/experience-delivery` exposes a separate `client.experienceFragment.get(...)` endpoint (`GET /experience_fragments/{id}`; the older `client.fragment.get(...)` is `@deprecated` in favor of it). Today's SDK doesn't see fragments — they're either inlined into the parent Experience by the API, or fetched separately by the customer.

### Slug routing

`client.view.getExperience(spaceId, envId, **experienceId**, ...)` takes an Experience ID, not a slug. Customers want `/blog/my-post` URLs, not `/IBMF5dElL6tgVuNR40fST`. Use a Destination for path-based routing: `fetchExperience({ spaceId, destinationId, path }, …)` resolves an absolute path, and `fetchDestinationSitemap` enumerates the paths (see [Destinations](#destinations-fetch-by-path-enumerate-with-the-sitemap)). The by-id path still takes an Experience ID.

### `resolveData` advanced merge policy

The Component Domain Model RFC describes `defineComponent({ props: { resolve, mergePolicy: { precedence, conflictStrategy }, private } })` — multi-source merge with explicit conflict handling. Today we have a single `resolveData` fn with fixed precedence.

### Svelte: no SSR recovery for `component-render-error`

`<svelte:boundary onerror failed>` doesn't run its catching machinery under `svelte/server` — a throw during SvelteKit's server render propagates and fails the entire page; the boundary only catches client-side. React and Angular don't share this gap (React's per-node `<Suspense>` boundary degrades gracefully under streaming SSR too; Angular has no separate server renderer at all). See the README's [Error handling & troubleshooting](./README.md#error-handling--troubleshooting) section for the full per-framework table.

This is upstream Svelte behavior, not something fixable at the adapter level — `svelte/server` exposes no per-node recovery primitive below its single top-level `render()` call. The README's mitigation is a `handleError` hook, which turns the crash into a controlled response without giving per-node isolation. Revisit if Svelte ships SSR-aware error boundaries.

### Angular: `component-render-error` isolation covers creation-time and adapter-driven resolution, not customer-internal later throws

`NodeRenderEngine.createView` wraps `viewContainerRef.createComponent(...)` in try/catch, catching a throw from a component's constructor, template evaluation, or `ngOnInit`. `collect()` separately wraps its own `unit.resolution()` read, so a throw from `resolveNode`/`resolveDesign` recomputing on a later sync (a `resolveToken` that starts failing, say) also swaps that node to the error fallback, and recovers automatically once resolution succeeds again (tracked via `unit.resolutionFailed`, mirroring `attemptedComponentType`'s "don't retry the same failure every sync" pattern).

Not caught: a throw inside the _customer_ component's own internals on a later change-detection pass (its own template expression, computed, or lifecycle hook) — that never touches adapter code, so nothing here catches it. A per-node `ErrorHandler` provider looks like the natural fix, since providers already flow per-node in this adapter, but doesn't work: `ApplicationRef.tick()` resolves `ErrorHandler` once, from the root injector, at construction, and never re-resolves it from whichever component's injector actually threw. This is a documented residual gap, not a partial fix. Revisit if Angular's error-handling internals change, or if there's a way to hook `ApplicationRef`'s zone-level error handling instead of DI.

---

## Common tasks

### Run tests

```sh
npm test                                         # all packages
npx nx run-many -t test --projects=adapter-react # one package
```

`adapter-svelte` runs **two** Vitest projects, and its `test` target runs both:

| Config                 | Env   | Files           | Svelte output |
| ---------------------- | ----- | --------------- | ------------- |
| `vitest.config.ts`     | jsdom | `*.test.ts`     | client        |
| `vitest.ssr.config.ts` | node  | `*.ssr.test.ts` | server        |

The split exists because the two Svelte builds are not interchangeable — most
notably, a compiled snippet receives its arguments as getters on the client but
by value on the server, and `NodesRenderer` constructs one snippet call by hand.
Anything touching snippets or slot rendering needs coverage in **both**.

`adapter-angular` uses the same two-config split — `vitest.config.ts` (jsdom) and
`vitest.ssr.config.ts` (node, `*.ssr.test.ts`, currently `nodes-renderer.ssr.test.ts`,
`debug-panel-coverage.ssr.test.ts`, and `live-preview-experience.ssr.test.ts`) — for
the same reason: the SSR path bootstraps through `@angular/platform-server`, which
behaves differently enough from the jsdom path to need its own environment.

`web` also uses two configs: `vitest.config.ts` runs browser-context behavior in
jsdom, while `vitest.ssr.config.ts` runs `*.ssr.test.ts` in Node to prove that
the public entry imports safely and pure context helpers fall back without browser
globals. It does not promise that the future stateful Web runtime can be constructed
or operated during SSR.

### Build everything from scratch

```sh
find packages -type d -name dist -exec rm -rf {} + 2>/dev/null
npx nx run-many -t build --skip-nx-cache
```

### Run the example app

```sh
# 1. Seed the demo Experience into your target space (one-time).
cd examples/scripts
cp .env.example .env         # fill in SPACE_ID, ENVIRONMENT_ID, CMA_TOKEN
npm run bootstrap            # seeds content + a Destination; prints the DESTINATION_ID to paste into the example's .env

# 2. Run the app.
cd ../nextjs
cp .env.example .env.local   # fill in SPACE_ID, ENVIRONMENT_ID, CDA_TOKEN, DESTINATION_ID (the bootstrap prints it)
npm run dev                  # http://localhost:3000/ and /demo/landing; by id: /experiences/landing
```

The bootstrap script (`examples/scripts/bootstrap-example.ts`) provisions everything the demo Experience references — ContentType, entries, assets, design tokens, Components, Experience Templates, DataAssemblies, the `home` and `landing` Experiences, and a Channel, Destination, and Destination Nodes — via the experiences management API. Idempotent per resource; safe to re-run against a half-seeded env. See `examples/scripts/README.md` for details.

### Add a new framework adapter

`packages/adapter-svelte` and `packages/adapter-angular` are the canonical examples of "framework that isn't React" — copy from either for non-React frameworks (different build tool, peer dep, etc.); copy from `packages/adapter-react` for "framework like React" (JSX-ish + tsup). `adapter-angular` is the closest template for a framework whose compiler owns the build: its `build` target is `ngc -p tsconfig.lib.json && publint`, with no bundler config at all.

1. `mkdir packages/adapter-vue && cd packages/adapter-vue`
2. Copy structure from `packages/adapter-react` (or `adapter-svelte` / `adapter-angular`) — `package.json`, `project.json`, `tsconfig*.json`, build config (`tsup.config.ts` for React-ish; `svelte.config.js` + `svelte-package` script for Svelte-ish; `tsconfig.lib.json` + `ngc` for Angular-ish), `vitest.config.ts`
3. Update `package.json#name` → `@contentful/experiences-vue` and `project.json#name` → `adapter-vue`
4. Set `package.json#version` to `"0.0.0"` — nx release needs a valid semver to bootstrap from (see "Bootstrapping a new package for release" below).
5. Re-export everything from `@contentful/experiences-sdk-core` and `@contentful/experiences-design`
6. Add adapter-specific renderer + `defineComponent` / `defineExperienceTemplate` types. The `defineComponent` shape's framework-specific bit is the primitive used to render: React uses `render: (props) => ReactNode`; Svelte uses `component: SvelteComponent`; Angular uses `component: Type<unknown>`. Vue would use `component: Component`, etc.
7. Teach the example app's bundler to transpile the workspace packages — `transpilePackages` (React/Next), Vite's `ssr.noExternal` allowlist (Svelte). Angular needs nothing here: `@angular/build:application` inlines workspace dependencies on both the browser and server builds.

### Add a new internal package (e.g. `tokens`)

1. `mkdir packages/tokens && cd packages/tokens`
2. Mirror `packages/design`'s structure (it's the simplest internal package)
3. Set `package.json#version` to `"0.0.0"` — nx release needs a valid semver to bootstrap from (see "Bootstrapping a new package for release" below).
4. Each adapter that wants to expose its API re-exports from it

### Bootstrapping a new package for release

Nx release computes each package's next version by finding the most recent git tag matching `{projectName}@{version}` and analyzing conventional commits since that tag. A brand-new package has no such tag, and `nx release` on `main` iterates every package in `packages/*` atomically — so a single missing tag will fail the release for the entire workspace, not just the new package.

Order matters:

1. On the new-package branch, set `package.json#version` to `"0.0.0"`. (Don't create `CHANGELOG.md` — nx generates it on first release.)
2. **Before merging**, seed the tag against `main`. Tag the commit **just before** the new-package introduction commit — this way nx sees the introduction as an unreleased `feat:`, so the first release actually publishes to npm. If you tag AT the introduction commit, the package sits at `0.0.0` until the next feat/fix touches it, which breaks any other package that lists it as a runtime dep.
   ```sh
   git checkout main
   git pull
   git tag -a <dir>@0.0.0 <sha> -m "Baseline tag so nx-release can derive bumps for <dir>"
   git push origin <dir>@0.0.0
   ```
3. Merge the new-package PR to `main`.
4. The next push to `main` triggers nx release. It sees the `<dir>@0.0.0` tag, scans commits from there forward, finds the `feat:` that introduced the package, and computes the first real release. Nx also creates `packages/<dir>/CHANGELOG.md` on this first run.

**If you merge before seeding the tag**, the next release run on `main` will fail for the whole workspace. Recovery:

```sh
git checkout main && git pull
git tag -a <dir>@0.0.0 <parent-of-introduction-sha> -m "Baseline tag so nx-release can derive bumps for <dir>"
git push origin <dir>@0.0.0
# Then push any new commit to main (or re-run the failed workflow) to trigger CI.
```

Same-shape command as step 2 — just done after the fact.

### Cut a release

Releases are fully automated by CI on push to `main` (stable) or `dev` (prerelease). Every `feat:` / `fix:` commit that touched a package's directory triggers a version bump for that package on the next merge.

- **Stable** — push to `main` → `release.yaml` runs `npx nx release --yes`. Publishes to npm's `latest` dist-tag; creates git tags and GitHub Releases; commits `chore(release): publish {version} [skip ci]` back to `main`.
- **Prerelease** — push to `dev` → `prerelease.yaml` runs `npx nx release --specifier prerelease --preid dev --yes`. Publishes to npm's `dev` dist-tag as `X.Y.Z-dev.N`; creates git tags and GitHub Releases marked "pre-release"; commits back to `dev`.

Consumers install with:

```sh
npm install @contentful/experiences-react           # latest stable
npm install @contentful/experiences-react@dev       # newest dev prerelease
```

**`dev` is not meant to be merged into `main`.** The two branches accumulate independent CHANGELOG histories so `main`'s file stays clean of prerelease entries. Features that should ship on both branches should be committed to each independently. Matches the pattern in `contentful/contentful-mcp-server`.

**`releaseTagPatternStrictPreid: true`** in `nx.json` ensures stable `nx release` on `main` skips over any preid-suffixed tag (e.g., `adapter-react@0.5.0-dev.3`) when computing the next version — dev tags cannot poison main's stable release computation.

Local dry-run to preview:

```sh
npx nx release --dry-run                                            # what a stable release would do
npx nx release --specifier prerelease --preid dev --dry-run         # what a dev prerelease would do
```

The first-ever release for a new package needs `--first-release` on its first run so nx doesn't look for a prior tag.

---

## What to do when something seems wrong

1. **Read this doc and the README.** Re-read; it's likely covered.
2. **Run `npx nx graph`** to confirm what depends on what.
3. **Check the example app builds.** It's the integration test for the whole pipeline. If it fails, the bug is in the SDK; if it passes, the bug is somewhere in the customer code.
4. **`git diff main`** — is there a stale change-set you forgot about?

If after all that it's still wrong, **document it in this file** under a "Things known to be broken" section, even if you fix it immediately. Someone will hit the same issue.
