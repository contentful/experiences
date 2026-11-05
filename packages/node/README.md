# @contentful/experiences-node

The Node.js SDK for fetching and resolving [Contentful Experiences](https://www.contentful.com/developers/docs/concepts/experiences/). It is the server-facing package for request handlers, server-rendered applications, and other Node processes. It produces `PortableRenderPlan` values; render them with the framework adapter your application uses.

## Install

```sh
npm install @contentful/experiences-node
```

## Session preview

Pass the incoming URL's Session ID before any event or handoff work:

```ts
const url = new URL(incomingRequest.url);
const request = sdk.forRequest({
  isPreview: Boolean(url.searchParams.get('preview_session_id')?.trim()),
  consent: visitorConsent,
});
await request.page(); // { accepted: false, reason: 'preview' } in Session preview
```

`isPreview: true` fixes read-only `request.isPreview` for this request, independently
of consent, CPA configuration and socket status. It defaults to false; the host determines
preview intent before calling `forRequest()`. All event calls skip before building or
profile lookup, report `onEventBlocked` with reason `preview`, and cannot affect other requests.
Preview fetches omit personalization and do not attach/adopt profiles. Handoff preparation
returns scope/cache only with `skipped: 'preview'`, without preflight or replay;
`canPersistProfile` still reflects persistence consent. With consent granted, the documented
cookie helper leaves an existing identity untouched because the handoff has no profile ID.
Other preview contexts may explicitly opt in with `isPreview: true`. Raw `sdk.api` calls
and standalone free fetches remain outside this policy.

For session snapshots, install the optional Live Preview package and configure
`preview.accessToken` on the SDK. When preview is enabled, bind the request once:

```ts
const request = sdk.forRequest({
  livePreview: {
    experienceId,
    sessionId,
    loadImplementation: () => import('@contentful/experiences-live-preview'),
  },
});
try {
  const plan = await request.fetchExperience({ experienceId }, { config: experienceConfig });
  renderPlan(plan);
} finally {
  request.destroy();
}
```

The session configuration sets preview policy immediately; its implementation loads
lazily once per request, only for the bound Experience ID. Unrelated IDs do not await
the loader, even if it fails or remains pending.
`isPreview: false` conflicts with it. Matching IDs load session plans with Runtime →
request → operation metadata/debug precedence; other IDs and destinations retain their
sources. Node opens no socket. Hosts omit automatic visitor-cookie work for preview.
`request.destroy()` invalidates unfinished content results and prevents late profile
writes without affecting sibling requests. Event calls disposed before transport return
`{ accepted: false }`; successful transports retain acceptance and Personalization response
data after disposal. See Runtime's
[shared limitations](../runtime/README.md#shared-limitations) for session-owned options,
credentials, cancellation, and packaging.

## Create an SDK instance, then bind every request

Create a process-long `ContentfulExperiences` instance from stable configuration. Call `forRequest()` at the boundary of every incoming request. The returned facade carries request-local fetch and resolve settings.

```ts
import { ContentfulExperiences } from '@contentful/experiences-node';

const experiences = new ContentfulExperiences({
  spaceId: process.env.CONTENTFUL_SPACE_ID!,
  environmentId: 'master',
  delivery: { accessToken: process.env.CONTENTFUL_DELIVERY_TOKEN! },
  preview: process.env.CONTENTFUL_PREVIEW_TOKEN
    ? { accessToken: process.env.CONTENTFUL_PREVIEW_TOKEN }
    : undefined,
  locale: 'en-US',
  resolveDefaults: {
    debug: false,
    metadata: { application: 'storefront' },
  },
});

// In each route or request handler:
const request = experiences.forRequest({
  locale: requestLocale,
  resolveOptions: {
    metadata: { requestId },
  },
});

const plan = await request.fetchExperience({ experienceId }, { config: experienceConfig });
```

An SDK instance retains only stable configuration and reusable delivery transports. Each fetch or resolve call receives its own `config`, so one instance can resolve different Experiences with different component registries. Direct event-only calls need no registry; XDA evaluation requires the operation's `config`. Use `forRequest()` at request boundaries so request-varying locale and resolve options cannot leak across concurrent requests. Multiple Node SDK instances can coexist; no teardown is required before constructing another. Each request facade belongs to its creating instance.

## Runtime Experience parameters

Supply values per by-ID fetch. The Experience declares accepted IDs in
`Experience.parameters`, and bindings read `$parameters/<id>`. Delivery enforces
names, requiredness, fallbacks, and value validation.

```ts
const plan = await request.fetchExperience(
  { experienceId, parameters: { featuredPosts: { limit: 6, order: '-fields.title' } } },
  { config: experienceConfig }
);

// Change parameters, refetch the same Experience, then replace the renderer's plan.
const nextPlan = await request.fetchExperience(
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

Pass a profile id and existing event arguments (or raw built XDA events) with a by-ID fetch to let XDA evaluate personalization while resolving the Experience:

```ts
const request = experiences.forRequest({
  locale: requestLocale,
  consent: visitorConsent,
  eventContext: { page: pageProperties, userAgent },
});
const plan = await request.fetchExperience(
  {
    experienceId,
    personalization: {
      profileId,
      events: [
        { type: 'identify', userId },
        { type: 'page', properties: pageProperties },
      ],
    },
  },
  { config: experienceConfig }
);
```

The request facade supplies its current profile ID when a by-ID fetch does not specify one. An explicit per-call `personalization.profileId` wins. XDA's returned `plan.personalization.profileId` updates that request facade for later fetches and events, unless a newer profile response has already taken ownership. This is local adoption, not upstream finalization; a newly previewed ID remains provisional and a subsequent profile-only fetch can fail with XPAPI GET 404. Supplying a profile or events switches the XDA call to POST. The Client boundary validates personalization and preserves built event fields, including `context.gdpr` and `context.page.title`, without mutating caller input. To request a source map in the same call, add `extensions: { sourceMap: {} }`. See [XDA preflight and profile finalization](../runtime/README.md#xda-preflight-and-profile-finalization) for chained evaluation and independent browser submission.

Plans can also expose optional `deliveryDiagnostics`, whose public
`ExperienceDeliveryDiagnostic` records contain only string `fieldPath` and
`message` from recognized upstream field-resolution errors. Raw resolution and
by-ID/destination fetching share the same Core normalization. Useful content,
profile adoption, exceptions, and existing local `diagnostics: Error[]` remain
unchanged. Absence does not prove personalization success or error-free delivery.
The strings may contain private information; show a generic warning/count and
inspect details explicitly, keeping them out of logs and public bootstrap/handoff
payloads. See the [delivery diagnostic guidance](../../README.md#delivery-diagnostics).

### Request-bound event construction

Fetch accepts raw built XDA events or existing `IdentifyBuilderArgs`,
`PageViewBuilderArgs` and `TrackBuilderArgs` with their `type` tag. The owner applies
consent before building arguments once with request context; supplied raw event
context is preserved. Advanced `request.eventBuilder` exposes `buildIdentify`,
`buildPageView` and `buildTrack` with the same request context. Explicit event inputs override request context; `forRequest({ locale })`
overrides `eventContext.locale`, followed by the SDK builder's existing defaults.
The merge is shallow: a supplied page replaces the whole request page. An explicit
`undefined` replaces the request field and uses the builder's normal fallback,
matching direct event methods. Page-event `properties` remains a separate input;
pass `properties: pageProperties` when it should describe the request page.
The request builder sets `context.gdpr.isConsentGiven` from this facade's event
consent (`true` only when granted), without changing the shared builder or another
request's metadata.

The public `ExperiencesNodeEventBuilder` type exposes only those construction
methods. Building does not submit events, apply consent admission, invoke event
interceptors, or update profiles. Those operations happen on submission. The shared
`experiences.eventBuilder` remains available for unbound construction. Submitting
already-built `personalization.events` preserves their supplied page/user-agent/
locale context and stamps the receiving request's event consent before interception.
Use the request builder rather than retaining visitor data in a shared interceptor
closure. See the [ordinary XDA rendering recipe](../../README.md#xda-rendering-and-browser-submission).

### Actual server-to-browser transfer

For SSR use ordinary `request.fetchExperience` with the existing type-tagged
arguments or raw built events above. XDA evaluates without committing; direct
event APIs remain callable but are not rendering prerequisites or compensation.

Only an actual hybrid response uses the retained Node producer:

```ts
const { handoff, plan, error } = await request.fetchExperienceForHandoff(
  { experienceId, personalization: { events } },
  { config: experienceConfig },
  { routeKey }
);
// Render available plan and safely serialize handoff in a private/no-store response.
// Browser optionally consumes the explicitly supplied handoff independently of display.
```

The third argument is `{ readonly routeKey: string }` only; `routeKey` is
pathname plus search beginning with `/`. The first two arguments retain ordinary
fetch/resolve shapes. Node exports `FetchExperienceForHandoffResult` with full
`handoff`, optional `plan` and optional `error`. Finalized replay survives
content fetch/resolve failure; invalid route, hook/schema failure or stale ownership
does not promise usable replay. The producer captures raw final Client events,
including query arrays, unchanged without a server replay-compatibility check before
XDA. Normal SDK builder XPAPI validation and Client XDA validation suffice; manually
built/raw transmission remains the consumer's compatibility risk. Receiving replay
validation may refuse events while available content remains usable. The existing
wire type unions raw Client and normal SDK events; no new DTO or SDK safety layer
is introduced. Preview suppresses visitor work.
Remove the Node aggregate commit path and handoff-as-content reuse branches/helpers.

Retry of the same Experience is ordinary fetch without events:

```ts
const plan = await request.fetchExperience({ experienceId }, { config: experienceConfig });
```

This performs no event building, event hooks or replay. Reference-only later-ID
comparisons also use ordinary event-free fetch; no cross-fetch guarantee applies.
See [Runtime's canonical XDA contract](../runtime/README.md#xda-preflight-and-profile-finalization)
for the tolerated SSR/CSR noncommit bug, hybrid replay ownership and accepted checks.
Phase 6 is complete and explicitly accepted on 2026-11-02. Phase 7 is complete and explicitly accepted on 2026-11-02, including its API refinements and simplification. Phase 8 is complete and accepted on 2026-11-02; Phase 9 is complete and explicitly accepted on 2026-11-02; Phase 10 is in progress and not accepted; phases 11–14 have not started; the Phase 6 gate is satisfied.

## Request-scoped events

Event methods live on the request facade, never on the process-long SDK instance. Supply the
current profile and request-derived event values when creating the facade; event calls update that
facade's profile without affecting concurrent requests.

```ts
const experienceRequest = experiences.forRequest({
  locale: requestLocale,
  profile: currentProfile,
  eventContext: { page: pageProperties, userAgent },
  consent: { events: hasAnalyticsConsent },
});

const identified = await experienceRequest.identify({ userId });
const evaluatedProfile = identified.accepted ? identified.data?.profile : undefined;
// Persist experienceRequest.profile if your application stores profiles between requests.

await experienceRequest.track({ event: 'checkout_started' });
await experienceRequest.trackClick({
  entityId: 'checkout-button',
  entityKind: 'Experience',
});
```

`identify`, `page`, and `track` send directly and return `{ accepted: true, data }` on success; transport errors reject. Their result type also permits accepted work without response data for a future queued sender. These calls update the request profile from the Personalization API response.
`trackView`, `trackClick`, `trackHover`, and `trackFlagView` send Analytics events and return
`EventEmissionResult`: `{ accepted: true }` when admitted and `{ accepted: false }` when consent
blocks them. Acceptance does not report transport success. A blocked call is reported to
`onEventBlocked`. All four require a current profile,
because a stateless request is bound to one; otherwise they throw `EventProfileRequiredError`. Event locale precedence is the
runtime default, `eventContext.locale`, `forRequest({ locale })`, then a method's explicit `locale`.
Personalization request locale uses `forRequest({ locale })` with the constructor locale as
fallback. An event's explicit locale changes its body only; it does not change content evaluation
or the Personalization request locale.
`consent.events` gates sending and sets `context.gdpr.isConsentGiven`. Until it is `true`, only
`allowedEventTypes` (default `identify` and `page`) are sent; a blocked Personalization call
resolves `{ accepted: false }`. Blocked Analytics calls resolve the same result. Blocked events are
dropped, never replayed, and reported to the runtime's `onEventBlocked`. Configure
`allowedEventTypes` and `onEventBlocked` on the runtime (`allowedEventTypes: []` is strict opt-in);
consent itself is per request. A boolean `consent` sets event and persistence consent together.
Consent is scoped to the request facade and is never shared across requests or persisted.
Check `request.canPersistProfile` before storing the profile id. A host that carries the
identity in the `ctfl-opt-aid` cookie reads it into `forRequest({ profile })` and uses
`canPersistProfile` to write or expire the response cookie; the cookie's presence is never
server-side consent. See the [Node example](../../examples/node/README.md). Events passed in
`fetchExperience({ personalization: { events } })` are filtered by the same request
consent before the request is sent; the `profileId` still travels. `eventConsent` is a deprecated
alias for `consent.events`. Personalization methods resolve `{ accepted, data? }`.

Consumer-supplied XDA intent use the request consent/interceptor/validation path.
Replay permits identify/track-only intent with an optional single final page; it
never creates a page. Browser admission of the finalized batch remains whole or
not at all, with only page-bearing refusal eligible for gated page fallback.

There is no request event queue. Await `identify`, `page`, or `track` when a
later call needs its evaluated profile; sequence profile changes whose results
depend on each other. Independent content fetches need no blanket serialization.

### Event interceptors

`experiences.interceptors.event` is one SDK-instance-owned
`InterceptorManager<OptimizationEventStreamEvent>`, shared by its request facades.
Each facade keeps its own profile, consent, and event context. Node has no state
interceptor registry. Register transforms with `add()` and retain the returned
id for `remove()`; `clear()` removes all handlers and `count()` reports their
number. Handlers run in insertion order, may be asynchronous, and receive cloned
inputs. A running chain snapshots its handlers, so registry changes affect later
submissions.

```ts
const interceptorId = experiences.interceptors.event.add((event) => {
  // Each handler receives its own deep clone; caller-owned events stay unchanged.
  event.context.userAgent = 'redacted';
  return event;
});
// At the owning application's cleanup boundary:
experiences.interceptors.event.remove(interceptorId);
```

The chain runs once for each admitted direct Personalization or Analytics event,
for each explicit XDA event submission, or when preparing each replay event.
Ordinary XDA fetch event chains run concurrently with `Promise.all`, preserving
input array order; handlers within each chain remain sequential. The actual server
transfer producer processes event chains sequentially, matching Optimization preparation. Passing raw events to another ordinary fetch
is another submission;
it is not exact replay. The actual server Node producer retains finalized XDA events once
for evaluation and commit without repeated hooks; browser admission still applies
current consent and its permitted metadata restamping.
Retries and browser prepared replay do not rerun event hooks; the admitted batch
retains IDs and timestamps under existing XPAPI schema/transport rules. Internal state application invokes no event hooks. Hooks transform events; direct methods keep their Personalization
or Analytics transport and do not accumulate events awaiting an XDA fetch.

The original consent gate runs before hooks. For XDA events, the SDK immutably
stamps request event consent into admitted inputs' `context.gdpr.isConsentGiven`,
overwriting any caller-supplied flag. Hooks receive that default metadata and may
explicitly transform it, following direct-event policy. The SDK then validates
transformed output against the destination schema and checks its final event type against
current consent before publication or sending. Invalid output is a schema failure,
not a consent refusal. A valid transformed event blocked by consent is reported
through `onEventBlocked` with its transformed method/type and the existing blocked
return contract. In XDA calls, those blocked events are removed while preserving
order and the profile/content fetch; hook or schema errors reject before transport.
Client remains responsible for XDA request validation and serialization, preserving
the full supported event shape and caller input.
This final-type check closes the original-type-only consent bypass in the Optimization reference at `70dfa7f`.

The Node root exports `InterceptorManager`, `Interceptor`, `InterceptorMerge`,
`MaybePromise`, and `OptimizationEventStreamEvent`, using the same names as Web;
Runtime owns their shared implementation and types. Stateless free fetch functions
have no global interceptor registry.

### Consume the XDA handoff

Only an actual server-to-browser transfer uses the Node producer described
[above](#actual-server-to-browser-transfer). Ordinary SSR uses normal fetch and
does not commit XDA-carried events; no Node aggregate commitment remains. Optional
explicit browser replay is governed by [Runtime](../runtime/README.md#xda-preflight-and-profile-finalization).

Only actual server-to-browser transfers retain the Node producer; ordinary SSR
uses normal fetch and does not commit XDA-carried events. Optional explicit browser
consumption owns hybrid replay. Necessary state application stays internal to that
complete operation. Standalone XPAPI preparation, separate supplied-data producers
and public state-only hydration are removed. Route, transport locale, replay limits,
scope/cache/consent/lifetime and serialization remain governed by the
[canonical Runtime contract](../runtime/README.md#xda-preflight-and-profile-finalization).
Content failure preserves usable server replay; same-ID Retry is ordinary event-free
fetch and never uses handoff as content input.

## Precedence

For settings that occur at more than one scope, later scope wins:

| Value                            | Precedence                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `locale` for an experience fetch | constructor fallback → `forRequest()` context → `fetchExperience()` options                                   |
| `metadata`                       | constructor defaults → `forRequest({ resolveOptions })` → method `resolveOptions`; objects are shallow-merged |
| `debug`                          | constructor default → request `resolveOptions` → method `resolveOptions`                                      |

`false` remains meaningful for `debug`: the SDK uses nullish fallback rather than truthiness.
The resolver `config` is required on each fetch or resolve call and is never
retained on the SDK or request facade.

## Delivery, preview, and destinations

`fetchExperience({ experienceId }, { config: experienceConfig })` uses the delivery client by default. Pass `preview: true` to use the preview client configured on the SDK instance:

```ts
const draft = await request.fetchExperience(
  {
    experienceId,
    preview: true,
  },
  { config: experienceConfig }
);
```

Preview is available only for by-id experience fetches. If the SDK instance has no `preview` client, `preview: true` throws an error. The destination endpoints remain delivery-only:

```ts
const result = await request.fetchByDestinationPath(
  {
    destinationId,
    path: requestPath,
  },
  { config: experienceConfig }
);

if ('redirect' in result) {
  // Route using result.redirect.path.
} else {
  // result is a PortableRenderPlan.
}
```

Destination node and path requests accept `personalization` (a profile id and caller-built events) like by-ID fetches. Consent and event interceptors apply to the events, the request's profile id is sent unless `personalization.profileId` is set, and the profile id XDA returns is kept for later calls. A redirect result carries no profile. The SDK does not send a locale or an environment identifier on Destination requests. They still use request-scoped resolve settings such as metadata and debug.

The runtime owns its Delivery and Preview clients. Configure each with an
`accessToken`, or configure a tokenless trusted proxy by supplying an explicit
`host`; the runtime disables generated bearer authentication for the latter.
For token-bearing transports, the bearer token is sent to the configured
endpoint. `environmentId` is the Contentful environment identifier used by
by-ID requests; it is not the generated delivery client's optional `environment`
endpoint setting. An explicit `host` wins over generated-client `environment`,
which wins over the Delivery or Preview default. Direct CPA preview fetches are
distinct from Preview Session live updates, which are owned by
`@contentful/experiences-live-preview`.

The runtime owns its Optimization API client. Configure trusted custom
`personalizationBaseUrl` or `analyticsBaseUrl` endpoints through the
constructor's `optimization` options; those endpoints receive complete event
and profile payloads, so use only trusted HTTPS origins outside explicit local
development.

## Errors

`NotFoundError` is re-exported for missing Experiences. Other delivery and resolution errors propagate to the caller, allowing your framework to apply its normal error handling.

```ts
import { NotFoundError } from '@contentful/experiences-node';

try {
  return await request.fetchExperience({ experienceId }, { config: experienceConfig });
} catch (error) {
  if (error instanceof NotFoundError) {
    // Use the framework's not-found response.
  }
  throw error;
}
```

## Request isolation

### Request-scoped submission options

`forRequest()` also accepts `experienceOptions` and `insightsOptions`, shared by every call made
through that request and never across requests. They are copied when the facade is created.

- `experienceOptions: { ip, plainText, locale }` is forwarded with each Personalization call and with
  the request-handoff preview, which still adds `preflight: true`. Pass the visitor's `ip` from a
  trusted source such as your proxy, because the API otherwise analyses the server's IP.
- `experienceOptions.locale` is a Personalization transport option, as in Optimization: it sets the
  locale the Experience API uses to translate profile location fields, and the handoff's replay
  locale. It does not change the content locale. `request.locale` and content fetches use
  `forRequest({ locale })` or the constructor locale only. When both are set, `forRequest({ locale })`
  also wins as the transport locale.
- `insightsOptions: { beacon }` is forwarded with each Analytics call.

Do not store a request facade beyond the request that created it. Each `forRequest()` call returns a separate object with its own locale and resolve options; concurrent requests do not share those values.

`forRequest()` is the only event-triggering surface. The long-lived class retains stable transport
configuration and a context-free base `EventBuilder`; it does not retain request profiles, locale,
page, user-agent, consent, or other request-sensitive event state.

## Architecture boundary

This package is a public Node-specific leaf over the internal `@contentful/experiences-runtime`, `@contentful/experiences-client`, and `@contentful/experiences-sdk-core` packages. Runtime retains only stable configuration, reusable Delivery and Optimization transports, and a base `EventBuilder` configured with an explicit platform channel. Client supplies the generated Delivery boundary and free fetch functions. The Node SDK binds event behavior and volatile profile state to each request facade. `@contentful/experiences-web` is its public sibling over the same lower layers, not a subclass of this Node SDK: it owns browser state while inheriting the shared runtime's trusted transport and direct by-ID preview capabilities.

## License

MIT. See the repository [`LICENSE`](../../LICENSE) and [`NOTICE`](../../NOTICE) for full attribution.
