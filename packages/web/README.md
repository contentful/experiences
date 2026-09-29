# @contentful/experiences-web

The browser SDK for fetching and resolving [Contentful Experiences](https://www.contentful.com/developers/docs/concepts/experiences/) in a Web application. It produces runtime-neutral `PortableRenderPlan` values; render a plan with the framework adapter used by your application.

> **Alpha.** This package is a lean browser runtime. Its API is still evolving.

## Install

```sh
npm install @contentful/experiences-web
```

## Browser transport and preview

This package inherits Client's by-ID Experience transport capabilities: it can use the Content Delivery API (CDA) and, when configured, the Content Preview API (CPA). Destination operations remain delivery-only.

Browser configuration is trusted application configuration. A bearer token is sent to the endpoint selected by that configuration, so validate the endpoint's origin, CORS/preflight policy, and token scope before constructing the SDK. Do not place tokens in query strings. Browser-visible delivery and preview tokens must be appropriate for the audience and origin that can load them; use a server boundary when that is not acceptable.

`environmentId` identifies the Contentful environment used by an Experience request. It is distinct from the generated delivery client's optional `environment` endpoint configuration. For endpoint selection, the Experiences SDK's `host` maps to the generated client's `baseUrl`; a raw `ContentfulViewDeliveryClient` can instead be constructed with `baseUrl` directly. Endpoint precedence is explicit `host`/raw-client `baseUrl`, then generated-client `environment`, then the delivery or preview default. These options support trusted custom endpoints such as a proxy, staging service, or regional endpoint.

```ts
import { ContentfulExperiences } from '@contentful/experiences-web';

const experiences = new ContentfulExperiences({
  spaceId,
  environmentId: 'master',
  resolverConfig,
  delivery: {
    accessToken: publicDeliveryToken,
    host: 'https://experiences-proxy.example.com', // optional trusted endpoint
  },
  preview: { accessToken: publicPreviewToken }, // optional direct CPA client
  locale: 'en-US',
  app: { name: 'storefront', version: '1.0.0' },
});

const plan = await experiences.fetchExperience({ experienceId });
const draft = await experiences.fetchExperience({ experienceId, preview: true });

experiences.setLocale('de-DE');
```

The generated delivery client must be able to reach the selected endpoint from the browser using its Authorization and feature headers. Validate CORS/preflight behavior in the browsers you support before deployment. If direct browser access is not appropriate, use a trusted same-origin client or an application BFF.

Optional custom Optimization endpoints receive complete event, profile, and
browser-context payloads. The runtime constructs and owns the Optimization
client; configure its Experience and Insights endpoints through `optimization`.
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
Insights events. Experience event responses can supply a profile to the runtime,
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
starting another profile-producing or Insights call on the same runtime.

## SSR import safety

The package can be imported by server-rendered applications, but importing it must not read browser globals or start browser work. Import safety does not make the live Web runtime a server runtime: create and use browser-owned SDK state only in client-side lifecycle code, and use the Node SDK plus a serializable `PortableRenderPlan` for server rendering. The separate SSR test configuration protects the public-entry import and pure browser-context fallbacks without promising that future stateful Web construction will run on the server.

## Errors and destinations

Missing Experiences surface the delivery client's `NotFoundError`; other delivery and resolution errors propagate so the application can apply its normal error policy. Destination operations use the delivery service and return either a resolved plan or a redirect result; route redirects at the application boundary.

For a by-ID fetch, `preview: true` selects the configured CPA client and throws if no preview client was configured. The delivery client's errors, including `NotFoundError`, otherwise propagate. Destination fetches remain delivery-only.

## Current limitations

- No profile persistence, offline queues, beacon/lifecycle delivery, consent
  gating, or automatic event tracking.
- No server request facade; use `@contentful/experiences-node` for request-scoped server work.

## Architecture boundary

`@contentful/experiences-web` is a public Web-specific sibling of `@contentful/experiences-node`. Both build on the internal `@contentful/experiences-client` and `@contentful/experiences-sdk-core` packages. The Web package owns browser state; the Node package owns request-local state. Neither package inherits the other's lifecycle semantics.

## License

MIT. See the repository [LICENSE](../../LICENSE) and [NOTICE](../../NOTICE) for full attribution.
