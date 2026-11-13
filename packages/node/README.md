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
  preview: { sessionId: url.searchParams.get('preview_session_id') ?? '' },
  consent: visitorConsent,
});
await request.page(); // { accepted: false, reason: 'preview' } in Session preview
```

A configured SDK `preview` integration plus a nonempty, trimmed request Session ID
sets read-only `request.isPreview` for this request, independently of consent and
socket status. Without either input, the request remains in ordinary mode.
All event calls skip before building or
profile lookup, report `onEventBlocked` with reason `preview`, and cannot affect other requests.
Preview fetches omit personalization and do not attach/adopt profiles. Handoff preparation
returns scope/cache only, without preflight or replay;
the request discards supplied visitor profiles and `canPersistProfile` is false.
Hosts check `request.isPreview` first and skip both visitor-cookie writes and expiry
for preview requests so existing visitor identity remains untouched.
Raw `sdk.api` calls and standalone free fetches remain outside this policy.

For session snapshots, configure `preview.accessToken` (or a trusted proxy host) on
the SDK and pass the active session through the request's `preview` option. Node uses
its existing Preview transport and needs no optional Live Preview package or socket.

For query-based sessions, Node re-exports Runtime's pure
`getPreviewSessionBinding(defaults, searchParams)` and `PreviewSessionBinding`
type. Supply the incoming request URL's parameters explicitly:

```ts
import { getPreviewSessionBinding } from '@contentful/experiences-node';

const requestUrl = new URL(incomingRequest.url);
const binding = getPreviewSessionBinding({ experienceId }, requestUrl.searchParams);
const preview = binding
  ? { sessionId: binding.sessionId, resourceResolution: binding.resourceResolution }
  : undefined;
// Pass preview to sdk.forRequest({ preview }).
```

Defaults accept `experienceId` and optional `sessionHost`/`resourceResolution`,
with no Session ID or environment fallback. Missing or empty Session IDs select
no binding; see Runtime's [query parsing contract](../runtime/README.md#preview-session-query-binding).
Call the helper according to your deployment policy; it does not load the preview
package or manage request/session lifetime. If you already have the Session ID, supply
`preview` directly:

```ts
const request = sdk.forRequest({ preview: { sessionId } });
try {
  const plan = await request.fetchExperience({ experienceId }, { config: experienceConfig });
  renderPlan(plan);
} finally {
  request.destroy();
}
```

An active request session with configured Preview transport sets preview policy immediately.
Preview credentials alone do not enable this policy. The request fetches one raw
session snapshot lazily and resolves it only when the successfully acquired raw
payload's `sys.id` matches the requested Experience ID. A mismatched or missing ID
uses the ordinary by-ID source through Delivery. Acquisition failure rejects before
identity is known, without published-content fallback; see Runtime's
[acquisition limits](../runtime/README.md#optional-runtime-live-preview).
A later call can retry a failed acquisition; a successful snapshot is retained for this request.
Each matching call retains its own registry and Runtime → request → operation
metadata/debug precedence. Optional
`resourceResolution` and `sessionHost` override constructor Preview defaults. Session
identity belongs to the request and cannot be configured on the shared SDK. Destinations retain
their sources. Node opens no socket. Hosts omit automatic visitor-cookie work for preview.
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
Preview Sessions retain
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

The request facade supplies its current profile ID when a by-ID fetch does not specify one. An explicit per-call `personalization.profileId` wins. XDA's complete `plan.personalization.profile` updates that request facade for later fetches and events, unless a newer profile response has already taken ownership. This is local adoption, not upstream finalization; a newly previewed ID remains provisional and a subsequent profile-only fetch can fail with Personalization API GET 404. The preview-generated ID can instead be reused by a subsequent Personalization API POST carrying events, through XDA or a direct event call. Supplying a profile or events switches the XDA call to POST; that SDK-to-XDA method does not change XDA's internal profile-only GET. The Client boundary validates personalization and preserves built event fields, including `context.gdpr` and `context.page.title`, without mutating caller input. To request a source map in the same call, add `extensions: { sourceMap: {} }`. See [XDA preflight and profile finalization](../runtime/README.md#xda-preflight-and-profile-finalization) for chained evaluation and independent browser submission.

Ordinary by-ID and destination fetches default supplied personalization to
`preflight: false`, requesting commitment of events and profile changes. Pass
`personalization: { preflight: true, events }` for evaluation without commitment.
`forRequest({ preflight: true })` sets a request-wide XDA default; an explicit
per-call `personalization.preflight` wins. This optional `RequestContext.preflight`
does not change direct `identify`, `page`, `track` or Analytics methods, and is
independent of editor Preview Sessions.

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

The public `RequestEventBuilder` type exposes only those construction
methods. Building does not submit events, apply consent admission, invoke event
interceptors, or update profiles. Those operations happen on submission. The shared
`experiences.eventBuilder` remains available for unbound construction. Submitting
already-built `personalization.events` preserves their supplied page/user-agent/
locale context and stamps the receiving request's event consent before interception.
Use the request builder rather than retaining visitor data in a shared interceptor
closure. See the [ordinary XDA rendering recipe](../../README.md#xda-rendering-and-browser-submission).

### Actual server-to-browser transfer

For SSR use ordinary `request.fetchExperience` with the existing type-tagged
arguments or raw built events above. Supplied personalization defaults to
`preflight: false`, requesting commitment through XDA; direct
event APIs remain callable but are not rendering prerequisites or compensation.
Ordinary SSR integrations do not prepare or consume replay. See
[Runtime's preflight contract and live-service release gate](../runtime/README.md#xda-preflight-and-profile-finalization).

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

The producer always uses `preflight: true`, overriding any request default, and
rejects an explicit per-call `personalization.preflight: false`. Browser replay
uses `preflight: false`. The third argument is `{ readonly routeKey: string }` only; `routeKey` is
pathname plus search beginning with `/`. The first two arguments retain ordinary
fetch/resolve shapes. Node exports `FetchExperienceForHandoffResult` with full
`handoff`, optional `plan` and optional `error`. Finalized replay survives
content fetch/resolve failure; invalid route, hook/schema failure or stale ownership
does not promise usable replay. The producer captures raw final Client events,
including query arrays, unchanged without a server replay-compatibility check before
XDA. Normal SDK builder Personalization API validation and Client XDA validation suffice; manually
built/raw transmission remains the consumer's compatibility risk. Receiving replay
validation may refuse events while available content remains usable. The existing
wire type unions raw Client and normal SDK events; no new DTO or SDK safety layer
is introduced. Returned XDA changes travel alongside the profile in the private
handoff state, including `[]` to clear browser flags; omitted changes remain absent.
This uses the same snapshot assumption as
[Web flag state](../web/README.md#custom-flags), pending live-backend verification.
Node retains no global flag state. Preview suppresses visitor work.
In Session preview, content acquisition or resolution failure returns `{ handoff, error }`
with scope/cache only and no replay or visitor identity. Invalid route/preflight or
matching Preview overrides still reject, as does unfinished work after request disposal.

Retry of the same Experience is ordinary fetch without events:

```ts
const plan = await request.fetchExperience({ experienceId }, { config: experienceConfig });
```

This performs no event building, event hooks or replay. Reference-only later-ID
comparisons also use ordinary event-free fetch; no cross-fetch guarantee applies.
See [Runtime's canonical XDA contract](../runtime/README.md#xda-preflight-and-profile-finalization)
for preflight, profile finalization and hybrid replay ownership.

## Custom flags

The process-long `experiences.getFlag(name, changes?: readonly unknown[])` is a
pure lookup: it returns the last valid matching flag's JSON value, or `undefined`,
without retaining changes or emitting an exposure. Read caller-owned Personalization
response `data.changes` or `plan.personalization?.changes` explicitly:

```ts
const value = experiences.getFlag('checkout-layout', plan.personalization?.changes);
```

Node re-exports `resolveFlagChange` and the `Json`, `ChangeArray`, and `VariableChange` types.
Use the helper for the winning record's metadata;
see the [shared resolution contract](../runtime/README.md#custom-flags).
The request facade retains no flag state; use `request.trackFlagView()` for an
explicit consent- and preview-gated server exposure if required.

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
`onEventBlocked`. All four require a complete current profile; otherwise they throw
`EventProfileRequiredError`. `forRequest({ profile: { id } })` remains valid for
Personalization and content-request continuity. An ID-only request must receive a
complete XDA or Personalization profile before sending Analytics. Event locale precedence is the
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
Check `request.isPreview` before any identity-cookie write or expiry: preview requests
leave the existing cookie untouched even though `request.canPersistProfile` is false.
Outside preview, check `request.canPersistProfile` before storing the profile id. A host
that carries identity in the `ctfl-opt-aid` cookie reads it into `forRequest({ profile })`
and uses `canPersistProfile` to write or expire the response cookie; the cookie's presence
is never server-side consent. See the [Node example](../../examples/node/README.md).
Events passed in `fetchExperience({ personalization: { events } })` are filtered by the same request
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
retains IDs and timestamps under existing Personalization API schema/transport rules. Internal state application invokes no event hooks. Hooks transform events; direct methods keep their Personalization
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

The Node root exports `InterceptorManager`, `Interceptor`, `InterceptorMerge`,
`MaybePromise`, and `OptimizationEventStreamEvent`, using the same names as Web;
Runtime owns their shared implementation and types. Stateless free fetch functions
have no global interceptor registry.

### Consume the XDA handoff

Only an actual server-to-browser transfer uses the Node producer described
[above](#actual-server-to-browser-transfer). Ordinary SSR uses normal fetch and
requests commitment for supplied personalization by default. Optional explicit browser replay is governed
by [Runtime](../runtime/README.md#xda-preflight-and-profile-finalization).

Only actual server-to-browser transfers retain the Node producer; ordinary SSR
uses normal fetch with `preflight: false` by default. Optional explicit browser
consumption owns hybrid replay. Necessary state application stays internal to that
complete operation. Route, transport locale, replay limits, scope/cache/consent/lifetime
and serialization remain governed by the
[canonical Runtime contract](../runtime/README.md#xda-preflight-and-profile-finalization).
Content failure preserves usable server replay; same-ID Retry is ordinary event-free
fetch and never uses handoff as content input.

## Precedence

For settings that occur at more than one scope, later scope wins:

| Value                            | Precedence                                                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `locale` for an experience fetch | constructor fallback → `forRequest()` context → `fetchExperience()` options                                       |
| XDA `personalization.preflight`  | ordinary default `false` → `forRequest({ preflight })` → explicit per-call boolean; handoff producer fixes `true` |
| `metadata`                       | constructor defaults → `forRequest({ resolveOptions })` → method `resolveOptions`; objects are shallow-merged     |
| `debug`                          | constructor default → request `resolveOptions` → method `resolveOptions`                                          |

`false` remains meaningful for `debug`: the SDK uses nullish fallback rather than truthiness.
The resolver `config` is required on each fetch or resolve call and is never
retained on the SDK or request facade.

## Delivery, preview, and destinations

`fetchExperience({ experienceId }, { config: experienceConfig })` uses Delivery unless
the request has an active Preview Session whose payload matches the Experience ID.
The destination endpoints remain delivery-only:

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

Destination node and path requests accept `personalization` (a profile id and type-tagged builder arguments or caller-built events) like by-ID fetches. Consent and event interceptors apply to the events, the request's profile id is sent unless `personalization.profileId` is set, and the complete profile XDA returns is kept for later calls. A redirect result carries no profile. The SDK does not send a locale or an environment identifier on Destination requests. They still use request-scoped resolve settings such as metadata and debug. A missing
Destination, path or node rejects with `NotFoundError`; the resolved plan's `experienceId`
names the Experience the Destination served.

An actual server-to-browser transfer of Destination content uses
`fetchDestinationForHandoff(selector, resolveOptions, { routeKey })`, the same producer as
`fetchExperienceForHandoff`: it pins `personalization.preflight: true`, rejects explicit
`false`, and returns `{ handoff, plan?, error? }` with replay surviving content failure.
A redirect returns `{ handoff, redirect }` without replay or plan: the redirecting route is
never presented, so do not hand its handoff to the browser. `sdk.fetchDestinationSitemap`
pages routable paths through the SDK-owned Delivery client.

The runtime owns its Delivery and Preview clients. Configure each with an
`accessToken`, or configure a tokenless trusted proxy by supplying an explicit
`host`; the runtime disables generated bearer authentication for the latter.
For token-bearing transports, the bearer token is sent to the configured
endpoint. `environmentId` is the Contentful environment identifier used by
by-ID requests; it is not the generated delivery client's optional `environment`
endpoint setting. An explicit `host` wins over generated-client `environment`,
which wins over the Delivery or Preview default. Node fetches Preview Session snapshots;
browser live updates use `@contentful/experiences-live-preview`.

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

`forRequest()` also accepts `personalizationOptions` and `analyticsOptions`, shared by every call made
through that request and never across requests. They are copied when the facade is created.

- `personalizationOptions: { ip, plainText, locale }` is forwarded with each Personalization call and with
  the request-handoff preview, which still adds `preflight: true`. Pass the visitor's `ip` from a
  trusted source such as your proxy, because the API otherwise analyses the server's IP.
- `personalizationOptions.locale` is a Personalization transport option, as in Optimization: it sets the
  locale the Personalization API uses to translate profile location fields, and the handoff's replay
  locale. It does not change the content locale. `request.locale` and content fetches use
  `forRequest({ locale })` or the constructor locale only. When both are set, `forRequest({ locale })`
  also wins as the transport locale.
- `analyticsOptions: { beacon }` is forwarded with each Analytics call.

Do not store a request facade beyond the request that created it. Each `forRequest()` call returns a separate object with its own locale and resolve options; concurrent requests do not share those values.

`forRequest()` is the only event-triggering surface. The long-lived class retains stable transport
configuration and a context-free base `EventBuilder`; it does not retain request profiles, locale,
page, user-agent, consent, or other request-sensitive event state.

## Architecture boundary

This package is a public Node-specific leaf over the internal `@contentful/experiences-runtime`, `@contentful/experiences-client`, and `@contentful/experiences-sdk-core` packages. Runtime retains only stable configuration, reusable Delivery and Optimization transports, and a base `EventBuilder` configured with an explicit platform channel. Client supplies the generated Delivery boundary and free fetch functions. The Node SDK binds event behavior and volatile profile state to each request facade. `@contentful/experiences-web` is its public sibling over the same lower layers, not a subclass of this Node SDK: it owns browser state while inheriting the shared runtime's trusted transport and Preview Session snapshot capabilities.

## License

MIT. See the repository [`LICENSE`](../../LICENSE) and [`NOTICE`](../../NOTICE) for full attribution.
