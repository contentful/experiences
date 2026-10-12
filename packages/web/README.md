# @contentful/experiences-web

The browser SDK for fetching and resolving [Contentful Experiences](https://www.contentful.com/developers/docs/concepts/experiences/) in a Web application. It produces runtime-neutral `PortableRenderPlan` values; render a plan with the framework adapter used by your application.

> **Alpha.** This package is a lean browser runtime. Its API is still evolving.

Only one live Experiences Web SDK instance is supported in a JavaScript runtime. Constructing a second while one is active throws. Call `destroy()` during teardown or hot reload before constructing a replacement; it stops active interaction observers and releases the Web owner lock. Experiences Web and Optimization Web are alternative product SDKs and are not supported together on one page. Applications must choose one; the SDKs do not coordinate with each other.

## Install

```sh
npm install @contentful/experiences-web
```

## Browser transport and preview

This package owns its Delivery and optional Preview clients. It can use the Content Delivery API (CDA) and, when configured, the Content Preview API (CPA). Destination operations remain delivery-only.

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

The generated delivery client must be able to reach the selected endpoint from the browser using its Authorization and feature headers. Validate CORS/preflight behavior in the browsers you support before deployment. If direct browser access is not appropriate, use a trusted same-origin client or an application BFF.

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

Events built by the Web runtime use the `web` channel and the current browser context. The runtime stores the current profile in LocalStorage and automatically supplies its id when `profileId` is omitted. An explicit per-call `profileId` wins. When XDA returns a profile id, it is available as `plan.personalization?.profileId` and becomes the persisted profile identity for subsequent calls.

The current XDA event-bearing POST has no noncommitting preflight option and
may commit supplied events. A Node-prepared Personalization handoff does not
make a separate XDA fetch render its uncommitted mutations. Applications that
independently use both paths for the same events may duplicate them; the SDK
adds no interim suppression.

## Browser-safe configuration

Each browser fetch or resolve call receives its own `config`; event-only use does not need one. Keep `resolveData`, `resolveToken`, and component configuration browser-safe, without server-only imports, secrets, or privileged calls. Treat resolver `metadata` as browser-visible too: pass only values that are safe to expose to the current user. Debug logging and source maps remain opt-in and can expose raw CMS data.

Locale is mutable browser state. Update it with `setLocale()` rather than sharing a request-scoped Node facade; browser navigation, language selection, and concurrent renders then observe the current client-side locale without leaking server request state. An explicit per-call locale still wins for that fetch.

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
initial profile when creating the runtime, or identify a profile before sending
Analytics events. Personalization event responses supply a complete profile to
the runtime, while XDA responses can supply its id. The current profile is
persisted and restored from LocalStorage once persistence consent is granted.
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
  profile: { id: 'visitor-123' },
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
admitted whole or refused at capacity. Acceptance is not HTTP
completion. Read `personalizationDeliveryState` for the latest request status
(`idle`, `pending`, `success`, or `failed`); failed queued batches retry with
their original event bodies. `destroy()` makes one best-effort attempt to drain
queued batches in order, without a delivery guarantee after the runtime exits.
The queue is not durable. Analytics methods continue
to send directly and require a profile or
an adopted continuation ID.

### Consent

`consent(true | false | { events?, persistence? })` records the visitor's
decisions, and `consentState` reads them. A boolean sets both axes; an object
updates either independently. Undecided is treated as not granted. This mirrors
the Optimization SDK's consent model.

- **Event consent.** Until `events` is `true`, only event types in
  `allowedEventTypes` (default `identify` and `page`) are sent. Selectors are the
  Optimization names: `identify`, `page`, `track`, `component` (views),
  `component_click`, `component_hover`, and `flag` (flag views only; `component`
  also admits them). A blocked Personalization call resolves
  `{ accepted: false }`; a blocked Analytics call resolves `false`.
  `gdpr.isConsentGiven` follows `events`. Blocked events are dropped, never
  replayed after consent is granted, and reported to `onEventBlocked`.
- **Persistence consent.** The profile is written to LocalStorage only when
  `persistence` is `true`. `false` removes the stored profile but keeps the
  in-memory one; undecided neither restores nor clears it.
- **Startup defaults.** `defaults: { consent, persistenceConsent }` take
  precedence over a stored decision, as in the Optimization SDK, so a configured
  value applies on every load. `persistenceConsent` falls back to `consent` when
  it is not set. An axis you leave unset keeps its stored value. Defaults are not
  written to storage; only a call to `consent()` is, so removing a default returns
  the visitor to their last stored choice. A default that denies persistence stops
  the stored profile being used but does not delete it.
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

This SDK does not write an anonymous-id cookie, so persistence consent gates
LocalStorage only. Gate any cookie your application sets yourself.

## Interaction tracking

> **Experimental.** `startInteractionTracking()` and its option and session types
> may change or be removed without a major version bump. It is a lower layer for a
> planned configured root that will start tracking and supply attribution itself.

The runtime can track views, hovers, and clicks on rendered Experiences and
Fragments automatically. Fetch with `extensions: { sourceMap: {} }`, mark the
outermost element of each node with the scopes it roots, then start a tracking
session with a lookup from scope key to attribution:

```tsx
import { getTrackingAttributes, useContentfulComponent } from '@contentful/experiences-react';

function Hero({ title }) {
  const contentful = useContentfulComponent();
  return <section {...getTrackingAttributes(contentful?.attribution)}>{title}</section>;
}
```

```ts
const session = experiences.startInteractionTracking({
  resolveAttribution: (key) => plan.attribution?.scopes[key],
});

// After the data behind the lookup changes, e.g. a new plan:
session.refresh();

// Before teardown (unmount, route change): sends the final events for
// in-progress views and hovers, then stops.
await session.stop();
```

`getTrackingAttributes` adds `data-ctfl-scopes`, listing the key of every
Experience or Fragment occurrence the node is a top-level node of. It renders
nothing for a node in the middle of a scope. The React, Svelte, and Angular
packages re-export it, and so does
`@contentful/experiences-web/tracking-attributes`.

- **Views** apply to Experiences and Fragments. **Hovers and clicks** apply to
  Fragments only. Nothing else is tracked: as a defensive runtime check, a
  lookup result with any other `entityKind` is ignored.
- Elements are grouped by scope occurrence. A Fragment rendered as several root
  elements is one view, hover, and click series. Two copies of the same Fragment
  are two, as long as something separates them: XDA gives both copies the same
  layer row and the same node ids, so copies placed directly next to each other
  cannot be told apart and report as one. A node inside both an Experience and a Fragment reports to both,
  under the kind rules above. The occurrence key is opaque: only
  `plan.attribution.scopes` can resolve it.
- A view counts after one second with any part of any of the occurrence's
  elements visible, and ends when none are. A hover counts after one second and
  ends when the pointer has left all of them. Each is reported when it qualifies
  and again with its final duration, under the same `viewId` or `hoverId`.
- A click counts on links, buttons, form controls, `[role="button"]`,
  `[role="link"]`, and elements with an `onclick` handler. It is attributed to the
  innermost Fragment occurrence of the nearest tracked element. Add `data-ctfl-clickable="true"`
  (`TRACKING_CLICKABLE_ATTRIBUTE`) to count other content.
- Events go through `trackView`, `trackHover`, and `trackClick`, so they need a
  current profile or an adopted handoff continuation ID. They do not wait for
  prepared Personalization HTTP delivery. A rejected call is logged as a
  warning and does not stop tracking.
- The attribute carries only opaque scope keys. Attribution never goes into the DOM.
- A node without an id cannot be tracked, and neither can a plan fetched without
  a source map.
- `@contentful/experiences-web/tracking-attributes` has no browser dependencies,
  so server-rendered components can import it.
- `startInteractionTracking` does nothing outside a browser. One session runs per
  runtime at a time. `stop()` frees it immediately, so a new session can start
  from a React effect whose cleanup cannot await; the stopped session finishes
  sending its final events in the background.

The lookup is `plan.attribution.scopes`. Wherever the plan reaches the browser
(client rendering, SvelteKit page data, Angular `TransferState`, React's
`ClientExperienceRenderer`) build `resolveAttribution` from it. React's
`ServerExperienceRenderer` keeps the plan on the server, so pass
`plan.attribution.scopes` as a prop to the client component that starts tracking.

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
current browser profile intact. Use `trackCurrentPage({ routeKey, buildPayload })`
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

## SSR import safety

The package can be imported by server-rendered applications, but importing it must not read browser globals or start browser work. Import safety does not make the live Web runtime a server runtime: create and use browser-owned SDK state only in client-side lifecycle code, and use the Node SDK plus a serializable `PortableRenderPlan` for server rendering. The separate SSR test configuration protects the public-entry import and pure browser-context fallbacks without promising that future stateful Web construction will run on the server.

## Errors and destinations

Missing Experiences surface the delivery client's `NotFoundError`; other delivery and resolution errors propagate so the application can apply its normal error policy. Destination operations use the delivery service and return either a resolved plan or a redirect result; route redirects at the application boundary.

For a by-ID fetch, `preview: true` selects the configured CPA client and throws if no preview client was configured. The delivery client's errors, including `NotFoundError`, otherwise propagate. Destination fetches remain delivery-only.

## Current limitations

- No durable event persistence, beacon/lifecycle delivery, or consent gating.
  Personalization's offline queue is in memory only. Automatic interaction
  tracking uses the direct Analytics methods.
- No framework adapter stamps tracked elements for you; components spread
  `getTrackingAttributes` onto their outermost element.
- Live Preview plans carry no source map unless the preview-session endpoints
  return one, so they have no attribution.
- No server request facade; use `@contentful/experiences-node` for request-scoped server work.

## Architecture boundary

`@contentful/experiences-web` is a public Web-specific sibling of `@contentful/experiences-node`. Both build on the internal `@contentful/experiences-runtime`, `@contentful/experiences-client`, and `@contentful/experiences-sdk-core` packages. Runtime owns shared event construction and orchestration; Client owns the generated Delivery boundary and free fetch functions. The Web package owns browser state; the Node package owns request-local state. Neither package inherits the other's lifecycle semantics.

## License

MIT. See the repository [LICENSE](../../LICENSE) and [NOTICE](../../NOTICE) for full attribution.
