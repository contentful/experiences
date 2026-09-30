# @contentful/experiences-web

The browser SDK for fetching and resolving [Contentful Experiences](https://www.contentful.com/developers/docs/concepts/experiences/) in a Web application. It produces runtime-neutral `PortableRenderPlan` values; render a plan with the framework adapter used by your application.

> **Alpha.** This package is a lean browser runtime. Its API is still evolving.

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
  resolverConfig,
  delivery: { accessToken: publicDeliveryToken },
  preview: { accessToken: publicPreviewToken }, // optional direct CPA client
  locale: 'en-US',
  app: { name: 'storefront', version: '1.0.0' },
});

const plan = await experiences.fetchExperience({ experienceId });
const draft = await experiences.fetchExperience({ experienceId, preview: true });

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
const plan = await experiences.fetchExperience({
  experienceId,
  personalization: {
    profileId,
    events: [experiences.eventBuilder.buildPageView()],
  },
});
```

Events built by the Web runtime use the `web` channel and the current browser context. The runtime does not retain profile state or send events separately; the application owns the profile id and supplies it on each personalized fetch.

## Browser-safe configuration

Resolver configuration runs in the browser. Keep `resolveData`, `resolveToken`, and component configuration free of server-only imports, secrets, and privileged calls. Treat resolver `metadata` as browser-visible too: pass only values that are safe to expose to the current user. Debug logging and source maps remain opt-in and can expose raw CMS data.

Locale is mutable browser state. Update it with `setLocale()` rather than sharing a request-scoped Node facade; browser navigation, language selection, and concurrent renders then observe the current client-side locale without leaking server request state. An explicit per-call locale still wins for that fetch.

## Context providers and redaction

The default event context is read lazily and includes the current URL, path, query parameters, search, hash, referrer, title, viewport dimensions, and User-Agent. SPA navigation is therefore reflected without reconstructing the SDK. These values can contain sensitive data.

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

The Web runtime provides direct event methods: `identify`, `page`, `track`,
`trackView`, `trackClick`, `trackHover`, and `trackFlagView`. Configure an
initial profile when creating the runtime, or identify a profile before sending
Analytics events. Personalization event responses can supply a profile to the runtime,
but profile state is volatile: this package does not generate identifiers
locally, persist them, or restore them after a reload.
Call `reset()` at logout, consent withdrawal, or another browser session
boundary. The next `identify`, `page`, or `track` call establishes the next
volatile profile.

```ts
const experiences = new ContentfulExperiences({
  // delivery and resolver configuration...
  profile: { id: 'visitor-123' },
  browserContext: {
    getConsent: () => consentStore.hasAnalyticsConsent(),
  },
});

await experiences.track({ event: 'cta_clicked', properties: { placement: 'hero' } });

// At logout or another visitor boundary:
experiences.reset();
```

Each call reads the current locale and browser context, so SPA navigation and
`setLocale()` changes are reflected without recreating the runtime. The consent
provider annotates the event context; it does not gate sending. Redact page and
user-agent data with the providers above before triggering events.
There is no browser event queue: await `identify`, `page`, or `track` before
starting another profile-producing or Analytics call on the same runtime.

## Interaction tracking

The runtime can track views, hovers, and clicks on rendered Experiences and
Fragments automatically. Mark the outermost element of each tracked Experience or
Fragment with its node id, then start a tracking session with a lookup from node
id to attribution:

```tsx
import { getTrackingAttributes } from '@contentful/experiences-web/tracking-attributes';

function Hero({ nodeId, title }) {
  return <section {...getTrackingAttributes(nodeId)}>{title}</section>;
}
```

```ts
const session = experiences.startInteractionTracking({
  resolveAttribution: (nodeId) => attributions[nodeId],
});

// After the data behind `attributions` changes, e.g. a new plan:
session.refresh();

// Before teardown (unmount, route change): sends the final events for
// in-progress views and hovers, then stops.
await session.stop();
```

- **Views** apply to Experiences and Fragments. **Hovers and clicks** apply to
  Fragments only. Nothing else is tracked: a lookup result with any other
  `entityKind`, such as an inline Fragment or Component, is ignored.
- A view counts after one second at least 10% visible. A hover counts after one
  second. Each is reported when it qualifies and again with its final duration,
  under the same `viewId` or `hoverId`.
- A click counts on links, buttons, form controls, `[role="button"]`,
  `[role="link"]`, and elements with an `onclick` handler. It is attributed to the
  nearest tracked element. Add `data-ctfl-clickable="true"`
  (`TRACKING_CLICKABLE_ATTRIBUTE`) to count other content.
- Events go through `trackView`, `trackHover`, and `trackClick`, so they need a
  profile and wait for a pending event handoff like any other call. A rejected
  call is logged as a warning and does not stop tracking.
- The attribute carries only the node id. Attribution never goes into the DOM.
- A node without an id cannot be tracked.
- `@contentful/experiences-web/tracking-attributes` has no browser dependencies,
  so server-rendered components can import it.
- `startInteractionTracking` does nothing outside a browser. One session runs per
  runtime at a time. `stop()` frees it immediately, so a new session can start
  from a React effect whose cleanup cannot await; the stopped session finishes
  sending its final events in the background.

See the [rendering-modes ADR](../../docs/ADRs/2026-09-30-interaction-tracking-across-rendering-modes.md)
for where the attribution lookup comes from under SSR, CSR, and Server Components.

## Server event handoff

Pass a request's Node-produced `eventHandoff` to the Web runtime to commit its
ordered events in the browser. `eventHandoff` and an initial `profile` are
mutually exclusive. Supply the current browser route identity as the required
`eventHandoffRouteKey`. A page-bearing journal commits only when that value
matches the handoff's `initialPageRouteKey`; a missing server marker or mismatch
skips the complete journal. Compatible adjacent Personalization entries share one
API request, while locale changes and Analytics entries remain ordering
boundaries.

```ts
const experiences = new ContentfulExperiences({
  spaceId,
  environmentId,
  resolverConfig,
  delivery,
  eventHandoff,
  eventHandoffRouteKey: currentRouteKey,
});

try {
  const receipt = await experiences.whenEventHandoffCommitted();
  if (receipt.initialPageRouteKey !== currentRouteKey) await experiences.page();
} catch {
  await experiences.page();
}
```

The receipt resolves with the matched route only after successful replay. A
missing server marker or mismatch resolves an empty receipt without replay. A
transport failure rejects the receipt but releases later direct event calls,
so the application can send its ordinary browser page. Replay can partially
commit and has no automatic retry or distributed exactly-once guarantee. The
handoff is browser-visible; use escaped
serialization in a private, no-store response and do not cache, log, or persist
it. See the root [paired replay guide](../../README.md#paired-server-to-browser-replay).

## SSR import safety

The package can be imported by server-rendered applications, but importing it must not read browser globals or start browser work. Import safety does not make the live Web runtime a server runtime: create and use browser-owned SDK state only in client-side lifecycle code, and use the Node SDK plus a serializable `PortableRenderPlan` for server rendering. The separate SSR test configuration protects the public-entry import and pure browser-context fallbacks without promising that future stateful Web construction will run on the server.

## Errors and destinations

Missing Experiences surface the delivery client's `NotFoundError`; other delivery and resolution errors propagate so the application can apply its normal error policy. Destination operations use the delivery service and return either a resolved plan or a redirect result; route redirects at the application boundary.

For a by-ID fetch, `preview: true` selects the configured CPA client and throws if no preview client was configured. The delivery client's errors, including `NotFoundError`, otherwise propagate. Destination fetches remain delivery-only.

## Current limitations

- No profile persistence, offline queues, beacon/lifecycle delivery, or consent
  gating. Automatic interaction tracking sends through the ordinary event
  methods, so it has the same limits.
- No framework adapter marks tracked elements yet; components do it with
  `getTrackingAttributes`.
- No server request facade; use `@contentful/experiences-node` for request-scoped server work.

## Architecture boundary

`@contentful/experiences-web` is a public Web-specific sibling of `@contentful/experiences-node`. Both build on the internal `@contentful/experiences-client` and `@contentful/experiences-sdk-core` packages. The Web package owns browser state; the Node package owns request-local state. Neither package inherits the other's lifecycle semantics.

## License

MIT. See the repository [LICENSE](../../LICENSE) and [NOTICE](../../NOTICE) for full attribution.
