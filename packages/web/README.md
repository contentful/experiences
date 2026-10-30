# @contentful/experiences-web

The browser SDK for fetching and resolving [Contentful Experiences](https://www.contentful.com/developers/docs/concepts/experiences/) in a Web application. It produces runtime-neutral `PortableRenderPlan` values; render a plan with the framework adapter used by your application.

> ⚠️ **Beta Preview.** Experience Orchestration is in Beta Preview. The SDK stays on `0.x` until general availability, so minor versions can include breaking changes. See [Versioning and stability](../../README.md#versioning-and-stability).

Only one live Experiences Web SDK instance is supported in a JavaScript runtime. Constructing a second while one is active throws. Call `destroy()` during teardown or hot reload before constructing a replacement; it stops active interaction observers and releases the Web owner lock. Experiences Web and Optimization Web are alternative product SDKs and are not supported together on one page. Applications must choose one; the SDKs do not coordinate with each other.

## Session preview

Set `isPreview: true` to suppress events or `isPreview: false` to select delivery.
When omitted, the SDK detects a nonempty, trimmed `preview_session_id` in the initial
browser URL. The resulting read-only `sdk.isPreview` is fixed at construction, before tracking starts.
All event methods return `{ accepted: false, reason: 'preview' }` and report through
`onEventBlocked`/`blockedEventStream`, without building, publishing or queueing events.
Consent stays unchanged; automatic and explicitly enabled interaction tracking stays inactive.

Preview fetches omit personalization and do not attach or adopt a profile. Handoff hydration
and replay are ignored; current-page methods return the same skipped result. Flush,
reconnect, page hide/Beacon and destroy send no preview events. Rendering and Session updates continue.

Mode stays fixed through reset, consent, URL changes and socket failure. Destroy and recreate
before entering/leaving Session preview in a SPA. CPA configuration, `preview: true` and `debug`
do not select this policy. Static preview without a Session ID is not detected automatically;
applications may opt in with `isPreview: true`. Raw `sdk.api` calls and standalone free
fetches remain outside it.

## Install

```sh
npm install @contentful/experiences-web
```

The package provides ESM and CommonJS entries with matching declarations for
the root, `./runtime`, `./tracking-attributes`, and `./bridge-support` exports.
These module builds retain their package dependencies as external imports.

For a page without a bundler, serve `dist/contentful-experiences-web.umd.js`
from the installed package and load it as a classic script. This standalone
bundle includes its runtime dependencies and exposes the
`ContentfulExperiences` constructor directly:

```html
<script src="/vendor/contentful-experiences-web.umd.js"></script>
<script>
  const sdk = new ContentfulExperiences({
    spaceId: 'YOUR_SPACE_ID',
    environmentId: 'master',
    delivery: { accessToken: 'YOUR_BROWSER_VISIBLE_DELIVERY_TOKEN' },
  });
</script>
```

The UMD builds directly from the SDK class module, following Optimization's Web
SDK distribution pattern. Helpers such as `getTrackingAttributes` remain available
through the existing `./tracking-attributes` module entry and can be included in
an application's asset build. The UMD artifact is served directly; the package's
supported module subpaths remain the exports listed above.

From this repository, `npx nx run web:build` builds all three formats with Rslib
and generates paired `.d.mts`/`.d.cts` declarations through the shared declaration
helper. The build tools require Node.js 22.12 or later.
`RELEASE_VERSION` overrides the package version embedded in event metadata.

## Browser transport and preview

This package owns its Delivery and optional Preview clients. It can use the Content Delivery API (CDA) and, when configured, the Content Preview API (CPA). Destination operations remain delivery-only.

The inherited readonly `api` is the actual Optimization API client, with
`api.experience` and `api.insights`; inherited readonly `config` retains the
typed Web configuration. Web keeps its queue references, event allowlist,
blocked-event callback, and connectivity accessor protected for subclasses.

Browser configuration is trusted application configuration. When configured, a bearer token is sent to the selected endpoint, so validate its origin, CORS/preflight policy, and token scope before constructing the SDK. Do not place tokens in query strings. Browser-visible delivery and preview tokens must be appropriate for the audience and origin that can load them; use a server boundary when that is not acceptable.

`environmentId` identifies the Contentful environment used by an Experience request. It is distinct from the generated delivery client's optional `environment` endpoint configuration. The runtime constructs its clients: `host` maps to the generated client's `baseUrl`. Endpoint precedence is explicit `host`, then generated-client `environment`, then the delivery or preview default. These options support trusted custom endpoints such as a proxy, staging service, or regional endpoint.

```ts
import { ContentfulExperiences } from '@contentful/experiences-web';

const experiences = new ContentfulExperiences({
  spaceId,
  environmentId: 'master',
  delivery: { accessToken: publicDeliveryToken },
  preview: { accessToken: publicPreviewToken }, // optional direct CPA client
  locale: 'en-US',
  app: { name: 'storefront', version: '1.0.0' },
});

const plan = await experiences.fetchExperience({ experienceId }, { config: experienceConfig });
const draft = await experiences.fetchExperience(
  { experienceId, preview: true },
  { config: experienceConfig }
);

experiences.setLocale('de-DE');
```

The generated delivery client must be able to reach the selected endpoint from the browser using its Authorization, feature, and `X-Contentful-User-Agent` headers. Validate CORS/preflight behavior in the browsers you support before deployment. If direct browser access is not appropriate, use a trusted same-origin client or an application BFF.

For a tokenless same-origin proxy, provide an explicit `host` without an
`accessToken`; the proxy owns the token and generated bearer authentication is
disabled in the browser client:

```ts
delivery: {
  host: 'https://application.example/experience-proxy',
}
```

Optional custom Optimization endpoints receive complete event, profile, and
browser-context payloads. The runtime constructs and owns the Optimization
client; configure its Personalization and Analytics endpoints through `optimization`.
Treat custom endpoints as sensitive-data destinations and use only trusted HTTPS
origins outside explicit local development.

Preview here means a direct, by-ID CPA fetch through the shared runtime. It is not a Preview Session: `@contentful/experiences-live-preview` owns Preview Session HTTP loading, WebSocket subscription, and update state. The Web SDK neither integrates nor owns that transport.

## Delivery diagnostics

Resolved plans expose optional `deliveryDiagnostics` for recognized upstream
field-resolution errors. The public `ExperienceDeliveryDiagnostic` type contains
readonly string `fieldPath` and `message` only; Core copies records in input order
and omits `originalError` and extra fields. Raw resolve, by-ID, and destination
fetches share that normalization. The existing local `diagnostics: Error[]`,
profile adoption, exceptions, and Personalization `experienceRequestState` retain
their meanings.

This is a partial projection, not a personalization outcome signal. An absent
field does not certify success or error-free delivery. Upstream strings can
contain private information; display a generic warning/count while preserving
content, inspect details explicitly, and keep them out of public bootstrap/handoff
payloads and automatic logs. See the [shared guidance](../../README.md#delivery-diagnostics).

## Runtime Experience parameters

Supply values per by-ID fetch. The Experience declares accepted IDs in
`Experience.parameters`, and bindings read `$parameters/<id>`. Delivery enforces
names, requiredness, fallbacks, and value validation.

```ts
const plan = await experiences.fetchExperience(
  { experienceId, parameters: { featuredPosts: { limit: 6, order: '-fields.title' } } },
  { config: experienceConfig }
);

// Change parameters, refetch the same Experience, then replace the renderer's plan.
const nextPlan = await experiences.fetchExperience(
  { experienceId, parameters: { featuredPosts: { limit: 12, order: 'sys.createdAt' } } },
  { config: experienceConfig }
);
```

Values are strings, numbers, or one-level Records of string/number leaves.
Collection order is one signed `fields.<apiName>` or `sys.<id>` path, with `-`
for descending order. `ExperienceParameters`, `ExperienceParameterValue`,
`ExperienceParameterRecord`, and `ExperienceParameterOrder` are public types.
GET sends `parameter.<id>[.<field>]`; empty Records, personalization, or defined
extensions select POST with an unprefixed structured map. `locale` stays separate.
Direct `preview: true` fetches accept the same option. Preview Sessions retain
server-owned `context.parameters` and WebSocket updates.
See the [render/refetch example](../../README.md#runtime-experience-parameters).

## Personalization

Pass a profile id and browser-built events through the first-class personalization option:

```ts
const plan = await experiences.fetchExperience(
  {
    experienceId,
    personalization: {
      profileId,
      events: [experiences.eventBuilder.buildPageView()],
    },
  },
  { config: experienceConfig }
);
```

Events built by the Web runtime use the `web` channel and its browser context
providers. Caller-built `personalization.events` must already contain the intended
context; submitting an event does not merge missing page/user-agent/locale values
into it. The runtime stores the current profile in LocalStorage and automatically supplies its id when `profileId` is omitted. An explicit per-call `profileId` wins. When XDA returns a profile id, it is available as `plan.personalization?.profileId` and becomes the persisted profile identity for subsequent calls.

The current XDA event-bearing POST has no noncommitting preflight option and
may commit supplied events. A Node-prepared Personalization handoff does not
make a separate XDA fetch render its uncommitted mutations. Applications that
independently use both paths for the same events may duplicate them; the SDK
adds no interim suppression.

## Browser-safe configuration

Each browser fetch or resolve call receives its own `config`; event-only use does not need one. Keep `resolveData`, `resolveToken`, and component configuration browser-safe, without server-only imports, secrets, or privileged calls. Treat resolver `metadata` as browser-visible too: pass only values that are safe to expose to the current user. Debug logging remains opt-in. Automatic interaction tracking requests source maps, which can expose raw CMS data.

Locale is mutable browser state. Update it with `setLocale()` rather than sharing a request-scoped Node facade; browser navigation, language selection, and concurrent renders then observe the current client-side locale without leaking server request state. An explicit per-call locale still wins for that fetch.

Constructor `locale` and `setLocale()` trim whitespace and replace underscores with
hyphens (for example, `' en_US '` becomes `'en-US'`). An omitted locale remains
`undefined`; invalid explicit values, including blank strings, `'*'`, and `'und'`,
throw. The package exports `normalizeLocale()` for normalization that returns
`undefined` for unusable values, and `normalizeExplicitLocale()` for the same
validation used by the constructor and setter.

## State and subscriptions

`experiences.states` exposes the browser SDK's observable state. Each observable
has a `current` snapshot, `subscribe(next)`, and `subscribeOnce(next)`:

| State                    | Value                                                                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profile`                | Current profile, or `undefined`.                                                                                                                     |
| `locale`                 | Current SDK locale, or `undefined`; update it with `setLocale()`.                                                                                    |
| `consent`                | Event consent: `true`, `false`, or undecided (`undefined`).                                                                                          |
| `persistenceConsent`     | Persistence consent: `true`, `false`, or undecided (`undefined`).                                                                                    |
| `experienceRequestState` | Latest Personalization request outcome: `{ status: 'idle' \| 'pending' \| 'success' }`, or `{ status: 'failed', reason: 'timeout' \| 'api-error' }`. |
| `eventStream`            | Most recent validated, consent-allowed event attempt, or `undefined`.                                                                                |
| `blockedEventStream`     | Most recently blocked event metadata, or `undefined`.                                                                                                |

`subscribe` immediately invokes its callback with the current value, including
`undefined`, then observes changes. `subscribeOnce` waits for the first
non-nullish value and automatically unsubscribes; `false` is a value, so it also
settles a one-time consent subscription. Both return a handle with
`unsubscribe()`. Subscriptions belong to the caller: dispose them when the
component or application lifecycle ends, including before replacing the SDK.

```ts
const profileSubscription = experiences.states.profile.subscribe((profile) => {
  console.log('Current visitor:', profile?.id);
});
const consentSubscription = experiences.states.consent.subscribeOnce((consent) => {
  console.log('First consent decision:', consent);
});

// During application/component cleanup; also cancels an undecided one-time subscription:
profileSubscription.unsubscribe();
consentSubscription.unsubscribe();
```

Object snapshots are deep-cloned by default, so changing a snapshot does not
update SDK state. `eventStream` uses the emitted event reference instead; treat
its values as immutable. For ordinary calls, `eventStream` publishes validated,
consent-allowed events before transport or queue admission, so an event may appear
even if queue capacity later refuses it. Each prepared event appears once only
when the whole batch is admitted; a refused prepared batch publishes none of its
events. Embedded `fetchExperience()` events appear after consent filtering and
serialization to XDA's event schema, using those serialized fields. Streams do not
report HTTP delivery or retries. Blocked events are published after the
`onEventBlocked` callback. `reset()` clears the profile, request outcome, and
both event streams while retaining locale and consent decisions.

Subscriber callbacks and snapshot functions run untracked: reading another SDK
state does not subscribe to it or replay the current stream value when it changes.
During event publication, synchronous `eventStream` subscriber errors are logged
without interrupting delivery, fetching, or prepared-replay admission and deduplication.
Publication order and subscriber-triggered reset/consent/destroy checks remain
unchanged; errors from other observables still propagate to their caller.

Lifecycle isolation is stronger than the [pinned Optimization
reference](../../AGENTS.md#parity-with-the-optimization-sdk): reset and event-consent withdrawal invalidate queued work and in-flight state updates,
so an older response cannot restore cleared state. Destruction and failed
construction dispose internal effects before releasing ownership. Response guards
keep a replacement instance isolated. Application
subscriptions still require the caller's `unsubscribe()` cleanup.

For extensions, the package also exports `signals`, `signalFns`, `batch`,
`effect`, `toObservable`, and `toDistinctObservable`, plus the types `Observable`,
`Subscription`, `CoreStates`, `ExperienceRequestState`, `ExperienceRequestFailureReason`,
`OptimizationEventStreamEvent`, `Signals`, `SignalFns`, `Signal`, and `SnapshotFn`.
The supported state names follow Optimization's shared browser-state contract;
Experiences has no flags, selected-optimization, optimization-eligibility, or
preview state in `states`.

### Interceptors

`experiences.interceptors.event` and `.state` are `InterceptorManager` registries.
Register synchronous or asynchronous transforms with `add()`, retain its id for
`remove()`, or use `clear()` to remove all transforms. They run in insertion order
with a cloned input; registry changes do not affect a chain already running.
Event interceptors run once per admitted submission after the original consent
gate, including caller-built events embedded in an XDA fetch. The destination
transport schema validates the transformed output, then the SDK checks its actual
event type against current consent before publication, sending, or queueing.
Invalid output is a schema failure, not a consent drop. A valid transformed event
blocked by consent is reported with its transformed method/type through
`onEventBlocked` and `blockedEventStream`. Every event method returns
`{ accepted: false }` for consent refusal. This
final-type gate corrects the original-type-only bypass in the Optimization reference at `70dfa7f`.

XDA runs event chains concurrently with `Promise.all`, preserving the input array
order; each event's handler chain remains sequential. Valid consent-blocked events
are omitted without cancelling the profile/content fetch. Hook/schema failures
reject before transport. Client owns the final XDA serialization, including removal
of unsupported fields. Reusing a built event in another explicit fetch runs the
chain again. Prepared server events are evaluated sequentially on Node; browser
replay and transport retries preserve those bodies, IDs, and timestamps without
rerunning event hooks. Browser replay still applies its current consent gate and
metadata. State-only handoff production and hydration invoke no event hooks.
Hooks transform supplied events and preserve Personalization, Analytics, and XDA
transport boundaries.

Runtime owns the shared manager and the `OptimizationEventStreamEvent` union;
Web's root imports remain compatible, and Node exposes the same manager/type
names with one event registry per SDK instance. Web retains its separate state
registry. The `./runtime` entry and snapshot runtimes remain unchanged and expose
no interceptor registry.

State interceptors receive incoming `{ profile }` state from Personalization,
XDA, and private handoff hydration before it is committed. A sparse result that
omits `profile` retains the previous value in the chain; `{ profile: undefined }`
explicitly clears it. The package exports `InterceptorManager`, `Interceptor`,
`InterceptorMerge`, `MaybePromise`, `ExperienceState`, `LifecycleInterceptors`, and
`mergeExperienceState`. XDA owns personalization resolution, so state interception
supports profile state only.

The `@contentful/experiences-web/bridge-support` entry exports
`hydrateOptimizationData(sdk, { profile })`, `CoreBridgeCapabilities`,
`CoreBridgeHost`, and the shared bridge symbol for compatible integrations. It
supports profile hydration only; it does not expose the Optimization Preview
Panel bridge. Shared state application reports request-state success atomically
with hydration, even when the incoming state is profileless. Profileless shared
handoffs therefore preserve existing profile and continuity. Ordinary XDA
content fetches do not request this bridge hydration.

## Context providers and redaction

The default event context is read lazily and includes the current URL, path, query parameters, search, hash, referrer, title, browser window dimensions, and User-Agent. SPA navigation is therefore reflected without reconstructing the SDK. These values can contain sensitive data.

Calling an event method sends these default values to the Optimization service.
If URLs, query parameters, referrers, or User-Agent values are not approved for
that destination, configure redacting providers before triggering events.

Use `browserContext.getPageProperties` and `browserContext.getUserAgent` to redact or replace the defaults before a value is retained, logged, or sent onward. Do not expose authentication material, raw identifiers, or personal data merely because it is available in the browser.

```ts
const experiences = new ContentfulExperiences({
  // delivery and resolver configuration...
  browserContext: {
    getPageProperties: () => ({
      path: window.location.pathname,
      query: {},
      referrer: '',
      search: '',
      title: document.title,
      url: `${window.location.origin}${window.location.pathname}`,
    }),
    getUserAgent: () => undefined,
  },
});
```

## Events

The Web runtime provides event methods: `identify`, `page`, `track`,
`trackView`, `trackClick`, `trackHover`, and `trackFlagView`. Configure an
initial profile through `defaults.profile` when creating the runtime, or identify
a profile before sending Analytics events. `CoreConfigDefaults` describes the
`defaults` object with `profile`, `consent`, and `persistenceConsent`. Personalization event responses supply a complete profile to
the runtime, while XDA responses can supply its id. The current profile is
persisted and restored from LocalStorage once persistence consent is granted.
`getAnonymousId` is an optional configuration callback whose returned id takes
precedence over the active profile id. The default provider reads the stored
anonymous id only when persistence consent is `true`; an `undefined` result falls
back to the current profile or adopted handoff identity.
Runtime event methods retain the original consent gate, run interceptors, then
validate transformed output and recheck its final type against current consent
before publication or admission. `trackView` preserves Optimization's early consent check before its
view-specific validation. `BlockedEvent.method` is a string, matching the
reference's public payload type.
Call `reset()` at logout or another browser session boundary. It clears queued
Personalization work and the current profile; the next successful event response
establishes and persists the next profile. `destroy()` stops owned listeners and
timers and releases the singleton for replacement.
After `destroy()`, calling `reset()` can still cancel an unfinished drain from
that instance. It does not clear LocalStorage at that point, because a replacement
Web SDK may already own the stored profile. Reset before destroy when ending a
visitor session.

```ts
const experiences = new ContentfulExperiences({
  // delivery and resolver configuration...
  defaults: { profile: { id: 'visitor-123' } },
});

// From your consent banner. Undecided is treated as not granted.
experiences.consent(true); // or consent({ events: true, persistence: false })

const result = await experiences.track({
  event: 'cta_clicked',
  properties: { placement: 'hero' },
});
// result.accepted is true for an admitted event; result.data may be absent while queued.

// At logout or another visitor boundary:
experiences.reset();
```

Each call reads the current locale and browser context, so SPA navigation and
`setLocale()` changes are reflected without recreating the runtime. Explicit event
locale overrides affect event bodies only. Ordinary Personalization sends use the
current SDK locale, including when flushing offline events. Prepared replay uses
the server's captured transport locale, including an absent locale, independently
of the browser's current locale. Redact page and
user-agent data with the providers above before triggering events.
Ordinary online Personalization calls send directly and may overlap queued
prepared work. Offline ordinary calls are accepted into an in-memory queue until
capacity, then refused without evicting accepted work. A prepared batch is
admitted whole or refused at capacity. Capacity is `queuePolicy.offlineMaxEvents`
(default 100; a non-positive or non-finite value falls back to the default, and a
fraction is floored). It is separate from the per-handoff payload limit. Acceptance is not HTTP
completion. Read `states.experienceRequestState.current` for the latest
Personalization request status (`idle`, `pending`, `success`, or `failed`);
failed queued batches retry with
their original event bodies. `destroy()` makes one best-effort attempt to drain
queued batches in order, without a delivery guarantee after the runtime exits.
The queue is not durable. Analytics methods
are queued in memory rather than sent one by one. Every Analytics method resolves
`{ accepted: true }` when admitted and `{ accepted: false }` when blocked or destroyed. Acceptance is consent admission, not delivery. Without a profile
or an adopted continuation ID, such as a new visitor's call made while the first profile request is
still pending, the call warns and is dropped, as in Optimization, and does not throw. The queue flushes when it holds 25 events, every 30 seconds while
events remain queued, when the browser comes back online, and when the page is hidden
or unloaded (`visibilitychange`, `pagehide`, `beforeunload`). On hide, active views and
hovers end first, then both queues get a final forced attempt: Analytics uses
`navigator.sendBeacon` and falls back to a keepalive `fetch`, and Personalization keeps
its ordinary request. Acceptance is not delivery: the call that fills the Analytics queue
also awaits the flush it triggers. A failed flush keeps its
events and retries with exponential backoff and a circuit breaker, matching the
Optimization SDK's defaults, which `queuePolicy.flush` can override: `flushIntervalMs`,
`baseBackoffMs`, `maxBackoffMs`, `jitterRatio`, `maxConsecutiveFailures`, `circuitOpenMs`, and
the `onFlushFailure`, `onCircuitOpen` and `onFlushRecovered` callbacks. It applies to both
the Personalization and Analytics queues. Call `flush()` to send queued Analytics events and
Personalization batches immediately, awaiting Analytics before Personalization. A
call made while an Analytics request is in flight waits for that request to settle
without starting another; retries stay scheduled independently. Reconnect and
visibility handling use the same order. Destruction starts both final flush
attempts independently before ending the instance lifetime.

### Consent

`consent(true | false | { events?, persistence? })` records the visitor's
decisions. Read `states.consent.current` and `states.persistenceConsent.current`
for each axis. A boolean sets both axes; an object
updates either independently. Undecided is treated as not granted. This mirrors
the Optimization SDK's consent model.

`hasConsent(name: string)` checks whether current event consent or
`allowedEventTypes` admits the supplied method/type selector.

- **Event consent.** Until `events` is `true`, only event types in
  `allowedEventTypes` (default `identify` and `page`) are sent. Selectors are the
  Optimization names: `identify`, `page`, `track`, `component` (views),
  `component_click`, `component_hover`, and `flag` (flag views only; `component`
  also admits them). A blocked Personalization call resolves
  `{ accepted: false }`; blocked Analytics calls resolve the same result.
  `gdpr.isConsentGiven` follows `events`. Blocked events are dropped, never
  replayed after consent is granted, and reported to `onEventBlocked`.
- **Withdrawing consent.** `consent(false)` or `consent({ events: false })` also
  drops events already accepted into the offline and Analytics queues, and cancels
  their retries, so they are not sent when the connection returns or when `destroy()`
  drains the queues. Queue cleanup and request/lifecycle invalidation complete in
  the same reactive batch before consent or request-state subscribers run, even
  if a subscriber destroys the SDK or throws. Explicit decisions are persisted
  before notification; subscriber errors still propagate to the caller.
  A request already on the wire cannot be recalled. A persistence-only change
  leaves the queue alone.
- **Persistence consent.** The profile is written to LocalStorage only when
  `persistence` is `true`. `false` removes the stored profile but keeps the
  in-memory one; undecided neither restores nor clears it.
- **Startup defaults.** `defaults: { consent, persistenceConsent }` take
  precedence over a stored decision, as in the Optimization SDK, and
  `persistenceConsent` falls back to `consent` when it is not set. An axis you leave
  unset keeps its stored value. Consent is resolved first and the profile is loaded
  after, so a default that denies persistence never loads the stored profile.
  Defaults have the same storage effects as in the Optimization SDK: the effective
  decisions are written to the consent keys, so a default **becomes the stored
  decision** and removing it later does not restore the visitor's earlier choice, and
  a default that denies persistence **deletes the stored profile**. A visitor who has
  not decided, with no defaults, has nothing written.
- **Consent itself** is always stored in LocalStorage, so a visitor's choice
  survives reloads. It is global to the runtime, not per call. It uses the
  Optimization SDK's keys and encoding, so pages on one origin share a visitor's
  decision whichever of the two SDKs they use, for example while migrating. The two
  SDKs are still not supported together on one page. `__ctfl_opt_consent__` holds
  `accepted` or `denied`
  for event consent, and `__ctfl_opt_persistence_consent__` holds the same for
  persistence consent. An absent key is undecided. Event consent `accepted` with no
  persistence key counts as persistence `accepted`. A value this SDK does not
  recognize is treated as undecided and left untouched.

`resolveStatefulDefaults(configured?, persisted?)` exposes the same startup
resolution independently of browser storage. It returns `{ defaults,
canLoadPersistedContinuity }`; a persisted profile may be a lazy loader and is
read only when persistence is granted and no configured profile is supplied.
The constructor uses this lazy path for LocalStorage. The package exports
`StatefulDefaults`, `PersistedDefaultLoader`, `PersistedDefaultValue`,
`PersistedStatefulDefaults`, and `ResolvedStatefulDefaults`; `CoreConfigDefaults`
uses the same supported profile and consent fields.

Personalization methods (`identify`, `page`, `track`) resolve
`{ accepted, data? }`, where `data` is the Personalization response.

The same gate applies to events that are already built:

- A server-prepared handoff batch (`hydrateAndTrackCurrentPage`) is checked against
  the browser's own consent before it is queued, so a server cannot send what the
  visitor has not allowed. A prepared batch is identify and track events followed
  by one page, and is admitted whole or not at all: if any event is not admitted,
  the batch is refused, each blocked event is reported to `onEventBlocked`, and the
  browser sends its own page event through the ordinary gated path instead. Each
  admitted event is sent with `context.gdpr.isConsentGiven` set from the browser's
  event consent, not the value the server stamped, so the flag always matches the
  decision that admitted it.
- Events passed in `fetchExperience({ personalization: { events } })` are filtered
  before the request, and the `profileId` still travels. They are not re-stamped,
  because XDA's embedded event schema has no consent field.

Wire types map to methods (`exo_node_view` to `trackView`, `exo_node_click` to
`trackClick`, `exo_node_hover` to `trackHover`, `component` to `trackFlagView`).
A type this SDK never emits, such as `screen`, is admitted only if it is listed in
`allowedEventTypes`, and a blocked one is not reported to `onEventBlocked`.

### Identity cookie

A server cannot read LocalStorage, so the SDK also keeps the visitor's identity in the
`ctfl-opt-aid` cookie, which a server reads to recognise them on the next request. It uses
the Optimization SDK's cookie names and storage keys, so both SDKs read and write the same
one. Everything here is gated on **persistence consent**; nothing is written without it.

- **What it holds.** A complete profile's id, else an identity adopted from a handoff, else
  the id already stored. The fallback means a visitor keeps their continuity while the
  profile is absent, and a static or public handoff, which carries no profile, cannot erase
  it. It follows profile responses, XDA profile ids and handoff state.
- **At startup, and when persistence is granted later,** the SDK adopts an identity the
  browser already holds, such as one a server wrote, and migrates a legacy `ntaid` cookie.
  That id is what the next request is sent under. A cookie for a different visitor than the
  profile held resets that profile first. An identity already held in memory is written when
  persistence is granted.
- **Withdrawing persistence** (or a default that denies it) removes the cookie and the stored
  id and keeps the in-memory profile. Event consent is independent.
- **`reset()`** clears the identity, the stored profile and the cookie. **`destroy()`** does
  not: it releases the SDK's resources and leaves approved continuity in place. A response
  invalidated by a withdrawal or a reset cannot recreate it.
- **Cookie settings** come from the `cookie` option: `domain`, `path`, `sameSite`, `secure`
  and `expires` in days (365 by default). A deletion always uses the scope the cookie was
  written with, so set the same values on any server that also writes it.

```ts
const experiences = new ContentfulExperiences({
  // ...
  cookie: { domain: 'example.com', sameSite: 'lax', secure: true },
});
```

On the server, the host reads the cookie, supplies it through `forRequest({ profile,
consent })`, and uses `canPersistProfile` to write or expire the response cookie. See the
[Node example](../../examples/node/README.md).

## Interaction tracking

Automatic discovery uses rendered plan boundaries through the existing
`getTrackingAttributes` helper. There is no separate tracking-session API. The
five Optimization-compatible controls remain available for explicit configuration
and manual observation.

The SDK also exposes Optimization-compatible imperative controls on `experiences.tracking`.
`EntryInteractionTracker` and `EntryInteractionTrackers` export the corresponding
Optimization-compatible type contracts. Runtime controls remain on `tracking`.

Constructor `autoTrackEntryInteraction: { views, hovers, clicks }` flags each default
to `true`. Use `false` to turn off automatic discovery for an interaction while
retaining explicit per-element registrations and per-element attribute opt-ins.
Automatic and attribute discovery use rendered plan attribution. Manual
registration with valid `data` works without a plan container:

```ts
const experiences = new ContentfulExperiences({
  // ...delivery configuration
  autoTrackEntryInteraction: { views: false, hovers: false, clicks: false },
});

// Insert the element into the document first. Use the actual plan attribution.
experiences.tracking.enableElement('views', card, { data: scopeAttribution });

// Remove the override; automatic/attribute defaults apply again.
experiences.tracking.clearElement('views', card);
```

- `tracking.enable(type, options?)` enables automatic tracking; `type` is
  `'views' | 'hovers' | 'clicks'`. Views accept `{ root?: Element | Document | null,
rootMargin?: string }`. Repeated enables with unchanged effective options preserve
  active intervals. For views, omitted and `null` roots are equivalent, as are CSS
  `rootMargin` shorthands that expand to the same four sides; changed effective
  observer options restart view measurements.
- `tracking.disable(type)` disables automatic discovery and retains manually
  enabled elements. `enableElement(type, element, { data? })` explicitly enables
  an element; `disableElement(type, element)` explicitly disables it.
  `clearElement(type, element)` removes either override.
- Explicit element overrides take precedence over `data-ctfl-track-views`,
  `data-ctfl-track-hovers`, and `data-ctfl-track-clicks` boolean attributes; those
  attributes take precedence over automatic flags. With rendered attribution,
  `true` starts tracking for a permitted element even when automatic tracking is
  disabled. Attribute changes are observed dynamically. Values are trimmed and
  case-insensitive; values other than `true`/`false` fall back to automatic
  behavior. Attribute opt-ins and manual enables remain subject to consent.
- Unlike Optimization's entry metadata, `data` is an Experiences
  `TrackingAttribution` (an actual value from `plan.attribution.scopes`). This is
  the content-model adaptation: views support Experiences and Fragments, while
  clicks/hovers support Fragments. Valid manual data takes precedence over the
  element's automatic scopes, so there is no duplicate automatic measurement.
  Invalid or absent data falls back to the element's automatic attribution.
  An element with manual data needs no `data-ctfl-scopes` attribute or lookup.
  Explicit registrations can observe any connected element, including headers or
  portals outside rendered Experience containers. View `root` options configure
  IntersectionObserver; automatic discovery follows the rendered boundaries.
  With valid explicit data, each manually registered element is one occurrence.
  Attribution fallback uses the automatic scope grouping; automatic multi-root
  scope grouping follows the rendered boundaries described below.
- Options and `data` are retained by reference, following Optimization. Reuse of
  the same options object leaves an enabled registration unchanged; clear and
  enable it again to explicitly start a fresh measurement.
- Manual registrations use the same dwell timers, event methods, consent gate,
  queues, and lifecycle token as automatic tracking. Consent withdrawal discards
  active intervals and retains overrides; regrant starts fresh intervals.
  `reset()` discards old measurements and clears manual overrides, then immediately
  resumes eligible automatic and attribute discovery with fresh intervals after
  resetting visitor state and the lifecycle token. It retains automatic settings;
  `destroy()` clears overrides and ends ownership. Delayed callbacks cannot cross
  visitor/reset boundaries.
- `WebExperiencesRuntime` adds these browser-only controls to
  `ExperiencesRuntime`; `createWebSnapshotRuntime()` supplies inert controls for
  SSR. Imports remain safe without browser globals.

The runtime discovers automatic tracking attributes when constructed, including
existing server-rendered HTML, and observes later DOM changes. Tracking does not
wait for server-profile handoff hydration. Manual registration with valid `data`
can also start immediately after construction and needs no automatic tracking
attributes. Web fetches request `sourceMap` when any automatic interaction type is
enabled, preserving caller-supplied extension options. Attribution is requested independently of
consent so granting consent later needs no content refetch. With every automatic
type disabled, explicitly request `extensions: { sourceMap: {} }` if a later
manual registration, attribute opt-in or automatic enable will need the
attribution. Plans supplied by Node or free fetch functions also need an explicit
source-map request.

Use the existing helper twice in your renderer: once for each rendered plan's
container and once for each node's actual roots:

```tsx
import { getTrackingAttributes, useContentfulComponent } from '@contentful/experiences-react';

// The application's existing container, including for server-rendered plans.
function TrackedExperience({ plan, children }) {
  return <div {...getTrackingAttributes(plan.attribution)}>{children}</div>;
}

function Hero({ title }) {
  const contentful = useContentfulComponent();
  return <section {...getTrackingAttributes(contentful?.attribution)}>{title}</section>;
}
```

The plan form emits `data-ctfl-attribution`, containing only scope attribution;
the node form emits opaque `data-ctfl-scopes` keys. The serialized scope records
contain only event attribution fields, including bound entry IDs; duplicate keys
and unrelated caller fields are omitted. The nearest attribution
container supplies the lookup and occurrence identity. Two containers rendering
the same plan remain independent; roots sharing a key inside one container remain
one occurrence. No lookup map, namespace, session, refresh or automatic cleanup
call is required. No framework adapter stamps either attribute for you.

Use DOM attribute APIs or your framework's escaped attribute bindings; do not
interpolate the JSON into unescaped HTML. Metadata is browser-visible, like the
content being rendered. Do not add secrets, profiles or unrelated plan data.
Malformed metadata is ignored; an invalid inner container never inherits an
outer container's attribution. Metadata is parsed once per container/value and
cached weakly. The SDK retains no fetched-plan registry or navigation history.

HTML defines no portable per-attribute size ceiling. Practical limits are browser
string/memory budgets and serialization/parsing cost, so attribution should stay
small relative to rendered content. Only scope metadata is serialized, once per
container; content, the full source map, profile and tokens are not included.
There is no silent truncation or arbitrary SDK size limit that could change event
attribution. Large Experiences should be measured in their target browsers. See
the [HTML data-attribute contract](https://html.spec.whatwg.org/multipage/dom.html#embedding-custom-non-visible-data-with-the-data-*-attributes)
and [implementation-defined resource limits](https://infra.spec.whatwg.org/#avoid-limits-on-algorithm-inputs).

Use SDK-generated scope keys unchanged. Slot names are escaped when the SDK builds
their opaque paths, keeping whitespace and path separators out of DOM tokens.
The DOM container's identity separates cloned or repeated presentations; metadata
changes start fresh occurrences without retaining previous plans.

Optional view geometry still uses the existing tracking controls:

```ts
experiences.tracking.enable('views', { root: scrollingPanel });
```

The helper is re-exported by React, Svelte and Angular and by
`@contentful/experiences-web/tracking-attributes`. Its implementation remains pure
and SSR-safe. The DOM boundary is an Experiences content-model adaptation of
Optimization's self-describing entry hosts: one Experience scope can span several
roots, and one root can belong to several scopes.

- **Views** apply to Experiences and Fragments. **Hovers and clicks** apply to
  Fragments only. Nothing else is tracked: as a defensive runtime check, a
  scope with any other `entityKind` is ignored.
- Fragment attribution includes `parentExperienceId` and `parentVariantId`
  for the root Experience, including when the Fragment is nested in another Fragment.
  `variantId` identifies the Fragment's own variant. Experiences and Fragments always
  have a `variantId`: the selected variant, or `default` when no variant ID is available.
  Experience attribution omits both parent fields.
- Elements are grouped by scope occurrence. A Fragment rendered as several root
  elements is one view, hover, and click series. Two copies of the same Fragment
  are two, as long as something separates them: XDA gives both copies the same
  layer row and the same node ids, so copies placed directly next to each other
  cannot be told apart and report as one. A node inside both an Experience and a Fragment reports to both,
  under the kind rules above. The occurrence key is opaque and resolved within its nearest plan container.
  Separate containers always distinguish repeated presentations of the same plan.
- A view counts after one second with any part of any of the occurrence's
  elements visible, and ends when none are. A hover counts after one second and
  ends when the pointer has left all of them. Each is reported when it qualifies
  and again with its final duration, under the same `viewId` or `hoverId`.
- A click counts on links, buttons, form controls, `[role="button"]`,
  `[role="link"]`, and elements with an `onclick` handler. It is attributed to the
  innermost Fragment occurrence of the nearest tracked element. Add `data-ctfl-clickable="true"`
  (`TRACKING_CLICKABLE_ATTRIBUTE`) to count other content.
- Events go through `trackView`, `trackHover`, and `trackClick`, so they need a
  current profile identity at event emission, which can come from persisted
  browser state, a cookie adopted at construction, or handoff state. They do not
  wait for handoff hydration or prepared Personalization HTTP delivery. A rejected
  call is logged as a warning and does not stop tracking.
- Withdrawing event consent discards active view/hover measurements and delayed
  callbacks. Detectors whose event types remain allowlisted restart with fresh
  intervals immediately; they continue working through regrant and later DOM updates.
- Node attributes carry opaque keys; the plan container carries their attribution.
  Removing or replacing an occurrence finishes its qualified view/hover intervals
  before disconnecting its last root. Unrelated occurrences continue measuring.
  Disabling automatic tracking does not cancel finals already captured by removal;
  reset and consent withdrawal still invalidate delayed work.
  This replaces the former application-owned stop-before-removal behavior; pinned
  Optimization drops intervals on unobserve, so this is an Experiences adaptation.
- A node without an id cannot be tracked, and neither can a plan fetched without
  a source map.
- `@contentful/experiences-web/tracking-attributes` has no browser dependencies,
  so server-rendered components can import it.
- `reset()` clears manual overrides and discards in-progress view and hover
  durations so they cannot cross visitor identities. After resetting visitor
  state and the lifecycle token, it immediately resumes eligible automatic and
  attribute discovery with fresh intervals, retaining the tracking configuration.
  Consent still gates tracking.
- Explicit manual registrations retain their supplied elements until cleared,
  reset or destroyed. Clear them when their presentation is discarded. DOM removal
  ends an active interval; removal/reinsertion can resume a retained registration.
- Construction outside a browser starts no observers. `destroy()` ends SDK
  ownership and disposes discovery and detectors; caller-owned state subscriptions
  still require their own cleanup. Use destruction when replacing an SDK within
  a live document. The SDK already handles hide/unload finalization; do not destroy
  it synchronously in a page-hide handler and cancel its pending final durations.

## Server event handoff

Create one browser runtime, then pass the `ExperiencesHandoff` prepared by Node
to `hydrateAndTrackCurrentPage`. Supply the visible pathname plus search as the
route key; the SDK does not read a router. Construction never sends a handoff.

```ts
const experiences = new ContentfulExperiences({
  spaceId,
  environmentId,
  delivery,
});

const result = await experiences.hydrateAndTrackCurrentPage(handoff, {
  routeKey: '/products?category=chairs',
});
// For accepted replay, result.accepted means queue admission, not HTTP completion.
```

The SDK validates the handoff envelope, space, environment, and cache safety before
adopting state or sending. Prepared event contents, count, and order are validated
at admission. A matching prepared replay is admitted once for the
current initialization; serialized copies with the same final page event ID
join it. A later handoff or return visit can track again. When the replay route
does not match, the SDK skips its evaluated state and events and tracks an
ordinary page for the supplied route. Prepared batches have a fixed SDK limit of
100 total events (including the final page), with at most 50 identify events.
The entire batch must also fit the remaining in-memory queue capacity. If
admission is refused (including invalid prepared events), the current initialization
quietly attempts one ordinary page through `trackCurrentPage()`, using the caller's
`buildPayload` or the default page payload, and returns its result. This attempt
retains adopted identity and applicable hydrated state and respects ordinary route
deduplication, capacity, and lifecycle guards; it can also return `{ accepted: false }`.
Supersession, reset, or destroy prevents a stale fallback. Once replay is accepted,
a later HTTP failure keeps existing retry behavior and never triggers fallback.
Ordinary online event calls and Analytics do not wait behind queued prepared delivery.

Use `hydrateHandoffState(handoff, { routeKey })` when state must be adopted before
page tracking. It joins a later `hydrateAndTrackCurrentPage` call for the same
current initialization. A profileless public or static handoff leaves the
current browser profile and continuity intact while atomically marking the shared
request state successful. Use `trackCurrentPage({ routeKey, buildPayload })`
for ordinary route tracking; its callback receives `isInitialEmission`. Manual
`page()` calls remain direct and are not deduplicated.

At the start of a still-current initialization, the SDK selects and publishes
continuation identity atomically. The live browser profile or an already adopted
continuation takes precedence over the incoming handoff ID. An initialization
superseded before it begins adopts nothing. Once published, the continuation
remains available for events and later navigation until a legitimate profile
update or an explicit reset/destroy boundary; navigation never rolls it back.
Supersession suppresses pending hydration and replay, but leaves already accepted
queue work intact. A concurrent `fetchExperience()` joins the current identity
initialization boundary without waiting for replay HTTP. Evaluated profile-state
hydration remains separate from the captured replay target.

A private handoff containing a profile, identity, or replay is browser-visible
sensitive data: escape its
serialization into a private, no-store response, and never cache, log, or
persist it. The application owns safe caching for profileless public/static
handoffs and the rest of its rendered response. Queue retries cannot
guarantee exactly-once delivery.

### State-only hydration after committed server rendering

The public Node `createRequestHandoffFromData({ spaceId, environmentId, data?, cache? })`
packages final request profile state without replay, events, or network work. Call
it after the last sequential server fetch, using `request.profile`; an earlier
response can contain stale identity. Its private-request cache scope is the
default and only accepted scope. An absent profile omits `state` entirely and
preserves the current browser profile and continuity, including after a JSON round
trip. This producer differs from Runtime's unchanged internal replay-preserving
helper with the same name.

For the committed-server flow, await a direct server page with an accepted result
and API-issued profile, then make distinct sequential identify-bearing XDA fetches.
Build identify with explicit request context, reuse each distinct plan for repeated
presentations, and package the final profile. Construct Web with no profile/consent
defaults. Automatic tracking uses the existing attributed HTML from construction;
register manual elements immediately. Subscribe and await `hydrateHandoffState()`
independently to adopt the final server profile.
Initial activation performs no content refetch or page event. Hydration does not
mark the route tracked.

Automatic tracking, attribute opt-ins, and explicit per-element controls coexist
and remain subject to consent. None requires handoff hydration before measurement.
On reset, synchronously invalidate pending application renders and replace old
attributed content before awaiting a new page/profile and content cycle: reset
resumes eligible discovery immediately. Register replacement manual elements after
insertion, and unsubscribe application subscriptions during cleanup. See the
[complete server/browser recipe](../../README.md#committed-server-rendering-and-state-only-hydration).
Personalization preflight remains separate and does not provide noncommitting XDA
content selection.

## SSR import safety

The package can be imported by server-rendered applications, but importing it must not read browser globals or start browser work. Import safety does not make the live Web runtime a server runtime: create and use browser-owned SDK state only in client-side lifecycle code, and use the Node SDK plus a serializable `PortableRenderPlan` for server rendering. The separate SSR test configuration protects the public-entry import and pure browser-context fallbacks without promising that future stateful Web construction will run on the server.

For presentation layers that consume already-resolved state, `createSnapshotRuntime()`
creates a read-only `ExperiencesRuntime` without browser ownership or transport:

```ts
import { createSnapshotRuntime } from '@contentful/experiences-web/runtime';

const runtime = createSnapshotRuntime({
  data: { profile: { id: 'visitor-123' } },
  locale: 'en-US',
  consent: true,
});
```

Its seven `states` observables are static: profile, locale, and consent come from
the snapshot, persistence consent falls back to event consent, request state is
`{ status: 'success' }`, and both event streams are `undefined`. `hasConsent()`
uses the snapshot's consent and optional `allowedEventTypes`. Event methods and
state-changing commands warn and do no work; methods returning an admission
result resolve `{ accepted: false }`. `destroy()` needs no cleanup. Fetching and
resolution remain outside this interface. `createSnapshotRuntime` and the types
`ExperiencesRuntime`, `ExperiencesSnapshot`, and `SnapshotRuntime` are exported
from both the package root and `@contentful/experiences-web/runtime`.

## Errors and destinations

Missing Experiences surface the delivery client's `NotFoundError`; other delivery and resolution errors propagate so the application can apply its normal error policy. Destination operations use the delivery service and return either a resolved plan or a redirect result; route redirects at the application boundary.

For a by-ID fetch, `preview: true` selects the configured CPA client and throws if no preview client was configured. The delivery client's errors, including `NotFoundError`, otherwise propagate. Destination fetches remain delivery-only.

## Current limitations

- No durable event persistence. Personalization's
  offline queue is in memory only, and withdrawing event consent discards it. Automatic interaction
  tracking uses the direct Analytics methods.
- No framework adapter stamps tracked elements for you; components spread
  `getTrackingAttributes` onto their outermost element.
- Live Preview plans carry no source map unless the preview-session endpoints
  return one, so they have no attribution.
- No server request facade; use `@contentful/experiences-node` for request-scoped server work.

## Architecture boundary

`@contentful/experiences-web` is a public Web-specific sibling of `@contentful/experiences-node`. Both build on the internal `@contentful/experiences-runtime`, `@contentful/experiences-client`, and `@contentful/experiences-sdk-core` packages. Runtime owns shared event construction and orchestration; Client owns the generated Delivery boundary and free fetch functions.

The Web package owns module signals and the effects for persistence, consent, and
connectivity, using `@preact/signals-core` and `es-toolkit`; the Node package owns
request-local state. Internal effects are disposed on destroy or failed construction
before the singleton lock is released, and late responses from a previous instance
cannot update its replacement. Neither package inherits the other's lifecycle semantics.

## License

MIT. See the repository [LICENSE](../../LICENSE) and [NOTICE](../../NOTICE) for full attribution.
