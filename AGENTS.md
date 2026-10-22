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
│   ├── adapter-svelte/       # @contentful/experiences-svelte (customer-facing)
│   └── adapter-angular/      # @contentful/experiences-angular (customer-facing)
├── examples/                # Customer-facing example apps
│   ├── nextjs/               # Next.js 15 example (external developers run this)
│   ├── sveltekit/            # SvelteKit 2 example (1:1 parity with nextjs)
│   └── angular/              # Angular 20 + @angular/ssr example (parity with both)
├── implementations/         # Standalone reference apps consuming local npm tarballs
│   ├── node-sdk/             # Express/EJS Node reference, managed through Nx
│   └── web-sdk/              # Vanilla browser/UMD reference, managed through Nx
└── lib/
    └── mocks/               # Private Personalization/Insights handlers and Contentful maintenance tools
```

**`examples/`** is the stable, external-facing surface — every commit to it should keep the customer-facing "clone + bootstrap + run" flow working.

**`implementations/`** stays outside npm workspaces and consumes packed SDK artifacts.
Use `npx nx run implementation-node-sdk:setup` / `:dev` or
`npx nx run implementation-web-sdk:setup` / `:dev`; root aggregate checks exclude
implementations. Follow [implementations/AGENTS.md](./implementations/AGENTS.md)
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
| `packages/adapter-svelte`  | `@contentful/experiences-svelte`       | **Customer-facing.** Svelte 5 renderer + re-exports of everything.                                                                |
| `packages/adapter-angular` | `@contentful/experiences-angular`      | **Customer-facing.** Angular renderer (`^20 \|\| ^21 \|\| ^22`) + re-exports of everything.                                       |
| `lib/mocks`                | `mocks`                                | **Internal, private.** Source-consumed Personalization/Insights handlers and explicit Contentful maintenance tools.               |

**Customers install the framework adapter for rendering.** The optional `@contentful/experiences-live-preview` package is customer-facing and can be used directly by an application or as an adapter's live-preview data source. The framework adapters declare `core`, `design`, `client`, and `runtime` as dependencies.

`client` remains the Delivery and free-function boundary. The `runtime` package
is runtime-neutral and stateless with respect to request and browser state.
Its lower-layer `ContentfulExperiences` base accepts
`RuntimeDeliveryClientOptions` configuration and constructs/owns its Delivery,
optional Preview, and Optimization clients; runtime constructors do not accept
caller-created clients. `accessToken` accepts the generated client's token
supplier. It may be omitted only when an explicit trusted proxy `host` is
configured: generated bearer auth is then disabled and that proxy owns upstream
authentication. The base exposes the actual Optimization client through
readonly `api` (`api.experience` and `api.insights`) and retains its typed leaf
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
profile ids cross the runtime-neutral boundary as `plan.personalization.profileId`, with redaction
before browser values are retained or emitted. Direct browser tokens are
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
immediately. The SDK does not persist event data durably or integrate event
delivery with Live Preview. The Web
runtime's `startInteractionTracking()` tracks views, hovers, and clicks on
elements carrying `data-ctfl-scopes` (a space-separated list of scope occurrence
keys, resolved through `plan.attribution.scopes`) and sends through the same
direct methods. `getTrackingAttributes` lives in core and is re-exported by every
adapter and by the `@contentful/experiences-web/tracking-attributes` subpath; no
adapter stamps the attribute for you, so components spread it onto their
outermost element. Preview fetches remain ordinary manual
event-call contexts: a manually invoked event method still sends while preview
is active.

By-ID fetch options accept per-call `parameters`: strings/numbers or one-level
Records of string/number leaves. Experience.parameters declares IDs and bindings
use `$parameters/<id>`; there is no dynamic flag. Client flattens GET values into
`parameter.<id>[.<field>]` through the generated client's `queryParams`; empty
Records or defined extensions select POST with an unprefixed structured map.
`@contentful/experience-delivery@1.0.0-dev.10` omits `parameters` in its generated
POST request type but preserves it through serializer passthrough; the SDK extends
the request type locally and transport tests verify the actual wire body, auth,
and rename header. Collection order is a single signed `fields.<apiName>` or
`sys.<id>` string, never binding `OrderTerm[]`. Delivery owns parameter validation
and fallbacks. Runtime/Node/Web forward values without retaining them; refetch and
replace the renderer's plan to swap content. Preview Sessions keep their existing
unprefixed `context.parameters` and server-owned WebSocket updates.

By-ID fetch options can also carry first-class personalization with a profile id
and caller-built events; Client maps it to XDA's extension body, and Node
proxies it without retaining state. Node and Web filter those events by consent before the request, keeping the profile id. The current generated XDA request has no
noncommitting preflight option. Independent Personalization preparation and an
event-bearing XDA fetch may duplicate events; this PR adds no interim
suppression or placeholder API. Typed XDA preflight integration follows upstream
support and must be verified before public release.
Existing free functions remain supported.

Events are consent-gated. Consent is `{ events, persistence }`, where undecided
means not granted. Until event consent is granted only `allowedEventTypes`
(default `identify` and `page`) are sent; the selectors are the Optimization
SDK's (`component`, `component_click`, `component_hover`, `flag`). A blocked
Personalization call resolves `{ accepted: false }`, a blocked Analytics call
resolves `false`, and `onEventBlocked` reports it. Blocked events are dropped,
never replayed, and withdrawing event consent (`consent({ events: false })`) also drops events
already accepted into Web's offline queue. The same gate covers caller-built fetch events and the prepared
handoff batch the browser replays. Node filters the optional initial identify and
track inputs one by one before it builds the batch, which still ends in one page, and
prepares nothing if the page itself is not admitted. Web admits a batch that is
already prepared whole or not at all, because it is replayed exactly as the server
previewed it. A refused prepared batch falls back to the browser's own gated page
event. Admitted prepared events are re-stamped with the browser's event consent,
not the server's; fetch events are not, because XDA's embedded event schema has
no consent field.
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

## Parity with the Optimization SDK

Optimization (`contentful/optimization`) is the behavioral reference for submission APIs, queue admission, completion semantics, lifecycle handling, retry and backoff, and configuration. Treat parity as a maintainability requirement: port a fix by following the corresponding Optimization contract, not by adding an alternative result type, fallback or configuration convention. Read the reference at a pinned commit, not a stale local checkout.

Web state and subscription mechanics follow Optimization at pinned commit
`59add9d6ebff503b9033a59a2eee0149d4b4e925`. Web owns module signals backed by
`@preact/signals-core` (`^1.13.0`) and `es-toolkit` (`^1.46.0`), and reactive
persistence, consent, and connectivity effects. Its readonly `states: CoreStates`
exposes `profile`, `locale`, `consent`, `persistenceConsent`,
`experienceRequestState`, `eventStream`, and `blockedEventStream` as observables.
`current` and subscription snapshots are cloned except for immutable
`eventStream` references. Subscriptions are caller-owned; `subscribe` emits the
current value immediately, and `subscribeOnce` stops at the first non-nullish
value, including `false`. Ordinary event attempts stream after validation and
consent, before transport or queue admission (including later capacity refusal),
never on retries or transport completion. Prepared admission emits each accepted
event once and batch refusal emits none. Blocked publication follows `onEventBlocked`. Reset clears
profile, request outcome, and event streams while retaining consent and locale.
Web startup values use `defaults: CoreConfigDefaults` (`profile`, `consent`, and
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
is not rewritten. Incoming Personalization, XDA, and private handoff profile state
is intercepted before commit. Sparse state results retain an omitted profile;
an explicit `profile: undefined` clears it. Only profile state is supported here
because XDA owns personalization resolution.

The Web entry also exports `./bridge-support`, with
`hydrateOptimizationData(sdk, { profile })`, `CoreBridgeCapabilities`,
`CoreBridgeHost`, and the bridge symbol.
This follows the reference bridge shape for compatible SDK integrations and
supports profile state only; it does not expose Optimization's Preview Panel
bridge. Shared state application publishes `experienceRequestState: success`
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
`./runtime` entry. Snapshot runtimes expose the same seven static observables and
inert event/command methods, with no fetch or resolve API. See the
[Web SSR reference](./packages/web/README.md#ssr-import-safety).

A difference is justified only when the content sources and their properties require it, or when server-side personalization here replaces client-side variant resolution there. A retained difference names that requirement. Existing code and new documentation are not a justification.

Retained differences:

- `onOfflineDrop` is not ported. It is deprecated and inactive in Optimization.
- Observable snapshot functions and subscribers run untracked so callback reads
  cannot add dependencies to a subscription. Event-stream publication reports
  synchronous subscriber errors without interrupting delivery or prepared-replay
  admission bookkeeping; other observable errors still propagate. These are local
  corrections of the pinned reference's behavior, preserving publication order
  and post-publication lifecycle checks.

The pinned reference does not provide identical lifecycle isolation. At that
commit, `CoreStateful.destroy()` marks the instance destroyed before flushing
both queues, has no `flushOnDestroy()` path, and does not dispose its internal
signal effects. Core reset does not clear queues or invalidate pending requests,
and `InsightsQueue` has no owner-provided reset token. Do not attribute the
Experiences safeguards below to that reference:

- Experiences disposes internal effects on destruction or failed construction
  before releasing the singleton. Late-response guards remain in force, so a previous owner cannot write state or persistence
  belonging to its replacement. Application subscriptions remain caller-owned.
- Experiences reset and event-consent withdrawal invalidate queued work and
  in-flight state publications. Analytics uses an owner reset token; direct
  Personalization requests must still be live to publish success or failure.
  These guards keep a previous visitor's response from restoring cleared state
  or recreating continuity after consent withdrawal.
- Experiences completes event-consent withdrawal in one reactive batch: both
  queues are purged and request/lifecycle guards are invalidated before consent
  or request-state subscribers run. Explicit consent decisions are persisted
  before subscribers can destroy the SDK and dispose pending persistence effects.
  The pinned reference publishes consent before purging queues; this is a local
  correction of that shared defect, not a claim that Optimization has been fixed.
- Experiences destruction starts both final flush attempts independently before
  ending the live lifetime. Personalization's `flushOnDestroy()` captures its
  teardown identity and joins the common drain; that drain follows only its own
  response identities, then cleans up its teardown authorization. This permits a
  best-effort final send while preventing late publications into a replacement.
- As in Optimization, `reset()` stops interaction detectors while retaining the
  tracking configuration and session. A later `session.refresh()` or consent
  synchronization resumes fresh intervals. Experiences also invalidates pending
  interaction callbacks with the owner's reset token, preventing old measurements
  from being sent under the next visitor's identity. Event-consent withdrawal
  discards active measurements and restarts permitted detectors with the new
  token, including allowlisted views and hovers. This restart is required by
  Experiences' additional token guard; the pinned reference retains permitted
  detectors without that guard.

Ordinary `flush()`, reconnect, and visibility handling await Analytics before
Personalization, following the reference order. Preserve the stated lifecycle
safeguards and report these retained differences when assessing parity; matching
state names or test outcomes alone does not establish mechanical lifecycle parity.

---

## Architecture in 60 seconds

The customer pipeline is three steps:

```
fetchExperience(experienceOptions, clientOptions, resolveOptions) → <ExperienceRenderer experience={…} />
```

`fetchExperience` is the **single async entry** for most customers — it fetches the payload from the Experience Delivery API and calls `resolveExperience` internally. The three positional args group by concern: **which experience**, **how to fetch**, **how to resolve**. Each grouping evolves independently (personalization slots into arg 3; digital-property identifiers widen arg 1) — a shape chosen to avoid one flat options object growing unbounded.

The existing free `fetchExperience` and framework-adapter path remains separate
from runtime construction. Customers who want to manage a delivery client there
have two paths: `createClient({ accessToken, host? })` (functional constructor,
our option shape), or `new ContentfulViewDeliveryClient({ token, baseUrl? })`
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

`fetchExperience` carries three concerns at once — fetch, resolve, and per-render context — and has more inbound (personalization params, digital-property identifiers from the channels RFC). A single flat options object would mix all three into one bag of a dozen-plus fields, so the signature is split into three grouped args:

1. `experienceOptions` — **which** experience (`spaceId`, `environmentId`, `experienceId`, `locale`). Digital-property identifiers widen this type when the channels RFC lands.
2. `clientOptions` — **how** to fetch. Discriminated union: `{ accessToken, host? }` OR `{ client }`. Kept intentionally as one arg (not split further) so users can move between inline creds and a pre-made client with only that arg changing.
3. `resolveOptions` — **how** to resolve (`config`, `context`). Personalization params (`audienceIds`, `userTraits`, etc.) go here.

Each grouping evolves without touching the others.

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

**We no longer send it.** `@contentful/experience-delivery@1.0.0-dev.7` sends it itself, defaulting to `new-exo-entity-types` in both `normalizeClientOptions` and every generated resource method. That covers all three entry points — `fetchExperience`, a `createClient` client, and a raw `ContentfulViewDeliveryClient` a customer constructs — so `packages/client` sets no headers at all. Before dev.7 we sent it from two call sites in `alpha-feature.ts`; that module and its exported constants were removed in the dev.7 cleanup.

One sharp edge in the generated merge order: `mergeHeaders(authHeaders, this._options.headers, <per-request default>, requestOptions.headers)`, later wins. The per-request default lands **after** client-level `headers`, so a `createClient({ headers: { 'x-contentful-enable-alpha-feature': … } })` entry is silently clobbered. Only `requestOptions.headers` (or `requestOptions.xContentfulEnableAlphaFeature`) can override it. Do not document client-level `headers` as an override path for this key.

Why this still matters for types: the delivery client types `GetExperienceResponse` as a union of the shapes the endpoint can return, because the generator can't know which header was sent. dev.7 did not collapse that union, so `fetch-experience.ts` still narrows to `HydratedExperienceView` by hand — the cast is sound because the header is now guaranteed, not because we set it.

### Why `createClient` in addition to the raw `ContentfulViewDeliveryClient` constructor?

`createClient` is a value-added passthrough that maps the SDK's option names (`accessToken`, `host`) onto the underlying client's names (`token`, `baseUrl`). Everything else flows through unchanged. It exists so the "inline creds" and "bring your own client" paths of `fetchExperience` share exactly the same field names — users can move between them mechanically instead of relearning vocabulary.

`fetchExperience`'s own inline-creds branch routes through `createClient` — single source of truth for the name mapping. If we ever add auth flavors beyond bearer-token, this is where they'd land.

### Why an empty-nodes payload is NOT a "not found"

Returning `null` for a payload with `nodes: []` would conflate two states the CMS considers distinct:

- **Experience doesn't exist** (404 from the delivery API) — the delivery client throws `NotFoundError`. Caller should route to their framework's 404 idiom.
- **Experience exists, empty content** (200 with `nodes: []`) — draft, unpublished, empty locale fallback, editor-in-progress. Legitimate CMS state; renders as an empty page.

So an empty-nodes payload flows straight through to `resolveExperience`, which handles it gracefully (no walker iterations, the Experience Template still resolves if present, returns a plan with `nodes: []`). `fetchExperience` returns `PortableRenderPlan`, never `null`.

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

We had `generateId()` early on. It's gone. The XDA payload sometimes carries `node.id`; when it does, we pass it through as `node.nodeId` on the IR. When it doesn't, `node.nodeId` is `undefined` and React keys fall back to array index, missing-component warnings omit the id. Generating fake IDs internally added a `crypto.getRandomValues` call per node and gave customers a surface to mistakenly rely on for stable references.

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

Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, etc.). Enforced via `commitlint.config.js` + `.husky/commit-msg`. **`feat:` and `fix:` trigger version bumps via `nx release`. `chore:` does NOT trigger a release.**

**Alpha-phase bump behavior**: `nx.json` sets `version.adjustSemverBumpsForZeroMajorVersion: true`, which applies SemVer V2 semantics for 0.x versions. While packages are on 0.x:

- `feat!` / `BREAKING CHANGE:` → minor bump (e.g., `0.4.0` → `0.5.0`), NOT major
- `feat:` → patch bump (e.g., `0.4.0` → `0.4.1`), NOT minor
- `fix:` → patch bump (unchanged)

Packages stay under `1.0.0` no matter what commit types land. **Remove this setting from `nx.json` when we're ready to ship 1.0.0 GA**

### Package boundaries

- **`core` has no dependencies.** It may not depend on `react`, the delivery client, or any framework-specific package. It owns runtime-neutral payload/plan types, resolution, diagnostics, and design-resolution support. Enforced by code review (no module-boundary lint rule yet, but it should land).
- **`design` owns CSS-property helpers.** Its `CSS_PROPERTIES`, `isCssProperty`, and `toCssKey` exports support the adapters' `toCss` helper. Core owns design-value and token resolution.
- **`client` is the only package that may depend on `@contentful/experience-delivery`.** All delivery-client usage must go through `packages/client` — never import it directly from an adapter, from `core`, or from the public Node or Web SDK. Live Preview remains independently configured in its own package.
- **`client` owns Delivery and free functions; `runtime` owns event construction and orchestration.** Client retains generated-XDA-derived request types, payload conversion, errors, and `fetchExperience`. Runtime depends on Client's public exports, never the generated dependency directly. Client never imports Runtime or forwards `EventBuilder`. Runtime owns the complete builder implementation, schemas, defaults, metadata, identity constants, Optimization transport, direct event methods, and lower-layer shared runtime. Node/Web runtime constructors take `RuntimeDeliveryClientOptions`, then construct and retain their own Delivery, optional Preview, and Optimization clients; they never accept caller-created delivery clients. The base exposes the actual Optimization client as readonly `api` (`api.experience` and `api.insights`) and retains its typed leaf config as readonly `config`; Delivery and Preview clients remain private. Web exposes its queue references, allowlist, blocked-event callback, and connectivity accessor as protected extension points; browser lifecycle and state internals remain private. A token may be a supplier, or may be omitted only with an explicit proxy host, which disables generated auth and must own upstream authentication. The runtime never retains request or browser state. `packages/node` is the public request-scoped leaf. Its ordinary event methods send directly, while `prepareRequestHandoff()` builds one identify/track/page batch and previews it once without committing. The request facade retains volatile profile and event context; no cumulative or mixed-transport Node journal remains. Web uses imperative `hydrateHandoffState`, `hydrateAndTrackCurrentPage`, and `trackCurrentPage` calls on its single live instance. A still-current paired initialization atomically publishes its continuation before hydration; existing profile/continuity wins over the incoming ID. Supersession cancels pending hydration/replay but never rolls back published identity or withdraws accepted queue work. Concurrent fetches can join identity initialization without waiting for replay HTTP. It persists its current profile in LocalStorage only once persistence consent is granted. Consent is a `{ events, persistence }` state, undecided meaning not granted: Web holds it globally and always stores it in LocalStorage, while Node scopes it to one `forRequest()` facade and never persists it. Without event consent only `allowedEventTypes` (default `identify`, `page`) are sent. It uses Runtime's in-memory Personalization sender for offline ordinary events and prepared batch admission. Handoffs are browser-visible exact event bodies; safely escape them into private/no-store responses, exclude secrets/server-only traits, and never cache, log, or persist them. Prepared replay has no durable queue or exactly-once guarantee. `identify`, `page`, and `track` use the Personalization API; `trackView`, `trackClick`, `trackHover`, and `trackFlagView` use Analytics. Web queues Analytics events in memory and flushes them at 25 events, every 30 seconds, on reconnect, and on page hide with `navigator.sendBeacon`, while Personalization gets its own forced attempt; `flush()` awaits Analytics before Personalization and joins an active Analytics flush. `queuePolicy.offlineMaxEvents` (default 100) caps offline Personalization admission, separately from the per-handoff payload limit. Node sends immediately. Runtime eager event validation follows Optimization's intercept-then-validate order, with `trackView` preserving the early consent check before view validation. `BlockedEvent.method` is a string, matching Optimization's public type. The Analytics methods follow Optimization's return contracts in both leaves: `trackView` resolves an `EventEmissionResult` (`{ accepted: false }` when consent blocks it or Web is destroyed), while `trackClick`, `trackHover` and `trackFlagView` resolve with no result. A failed transport is not reported through either. Without a profile Web warns and drops the event, while Node, whose requests are bound to a profile, throws `EventProfileRequiredError`. `forRequest()` accepts `experienceOptions` (`ip`, `plainText`, `locale`) and `insightsOptions` (`beacon`), copied per request. `experienceOptions.locale` is only the Personalization transport and replay locale; the content locale comes from `forRequest({ locale })` or the constructor. There is no durable event persistence or Live Preview event integration. Web interaction tracking (`startInteractionTracking()`) is browser-only and sends through the Analytics methods, so it uses that queue. Direct CPA fetching is distinct from the Preview Session HTTP/WebSocket functionality owned by `packages/live-preview`; manually invoked event methods still send during preview. The separate adapter/free `fetchExperience(..., { client })`, `createClient`, and raw `ContentfulViewDeliveryClient` paths remain supported. See the root [paired replay guide](./README.md#paired-server-to-browser-replay).
- **One live Experiences Web SDK per JavaScript runtime.** Web owns a `globalThis` lock and releases it on construction failure or idempotent `destroy()`, after stopping active interaction observers and disposing internal state effects. The shared Runtime base and Node SDK do not acquire that lock; independent Node instances may coexist, and `forRequest()` facades remain request-local views of their own Node instance. Experiences Web and Optimization Web are alternative product SDKs; consumers must not run both on the same page. The SDKs do not coordinate their locks or profile storage.
- **The customer-facing adapter (`adapter-react`) owns the SDK-wide re-exports.** The `live-preview` package has its own customer-facing entry point. Internal packages keep their exports in their own entry points.

**Consequence for `core`'s payload types.** Because `core` stays zero-dep, its payload-facing types (`ExperienceNode`, `ComponentNode`, `ExperienceTemplateNode`, `ComponentRef`, `ExperienceTemplateRef`, `ExperienceSys`, `ExperiencePayload`) are **hand-mirrored** from `@contentful/experience-delivery` rather than imported from it. Each carries a doc comment naming its upstream counterpart (`RenamedComponentTreeNode`, `ComponentLink`, `RenamedDeliveryExperienceSys`, …). They're deliberately structural supersets — a few upstream-required fields are optional here so `resolveExperience` also accepts hand-authored payloads — which is why `fetch-experience.ts` can assert a delivery response straight to `ExperiencePayload` with no normalization step.

**When the delivery SDK regenerates, re-check that mirror.** `packages/core/src/types.ts` is the only place it lives; `client:typecheck` is what catches a drift, because that assertion stops compiling if the shapes diverge.

### File naming

- React components in design-system + adapter packages: `PascalCase.tsx`
- Non-component modules: `kebab-case.ts(x)`
- Tests: `<source>.test.ts(x)` next to the source

### Tests

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
- Routine scoped cleanup and regeneration within the authorized repository requires no additional user confirmation. Coordinate with active builds or other agents using the same outputs, then clean and rebuild in dependency order. Do not clean the concurrently owned Optimization repository.
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

It returns JSX (the render fns). The compiler picks up the `tsx` extension; importing the `tsx` file into `app/[slug]/page.tsx` works because Next resolves both extensions.

### `next-env.d.ts` is gitignored

Next regenerates it on every `next build`. It's in `.gitignore`. If you see lint complaining about it, you've accidentally tracked it — `git rm --cached`.

### Nx cache + tsup builds

`build.yaml` saves `packages/*/dist` to a job-scoped cache; `check.yaml` and `release.yaml` restore it. **The cache key is `build-cache-${run_id}-${run_attempt}`** — meaning each CI run is its own cache. Across runs, Nx's local content-hash cache (`.nx/`) handles incremental work. Don't change the cache path unless you also update both restore steps.

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

`client.view.getExperience(spaceId, envId, **experienceId**, ...)` takes an Experience ID, not a slug. Customers want `/blog/my-post` URLs, not `/IBMF5dElL6tgVuNR40fST`. No SDK-side helper today.

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
npm run bootstrap            # prints experienceId (default: `landing`)

# 2. Run the app.
cd ../nextjs
cp .env.example .env.local   # fill in SPACE_ID, ENVIRONMENT_ID, CDA_TOKEN
npm run dev                  # http://localhost:3000/landing
```

The bootstrap script (`examples/scripts/bootstrap-example.ts`) provisions everything the demo Experience references — ContentType, entries, assets, design tokens, Components, Experience Templates, DataAssemblies, Experience — via the experiences management API. Idempotent per resource; safe to re-run against a half-seeded env. See `examples/scripts/README.md` for details.

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
