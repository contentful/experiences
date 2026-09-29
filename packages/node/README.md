# @contentful/experiences-node

The Node.js SDK for fetching and resolving [Contentful Experiences](https://www.contentful.com/developers/docs/concepts/experiences/). It is the server-facing package for request handlers, server-rendered applications, and other Node processes. It produces `PortableRenderPlan` values; render them with the framework adapter your application uses.

## Install

```sh
npm install @contentful/experiences-node
```

## Create one SDK instance, then bind every request

Create a process-long `ContentfulExperiences` instance from stable configuration. Call `forRequest()` at the boundary of every incoming request. The returned facade carries request-local fetch and resolve settings.

```ts
import { ContentfulExperiences } from '@contentful/experiences-node';

const experiences = new ContentfulExperiences({
  spaceId: process.env.CONTENTFUL_SPACE_ID!,
  environmentId: 'master',
  resolverConfig: experienceConfig,
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
    initialViewportId: viewportId,
  },
});

const plan = await request.fetchExperience({ experienceId });
```

The singleton retains only stable SDK configuration and reusable delivery transports. Use `forRequest()` at request boundaries so request-varying locale and resolve options cannot leak across concurrent requests.

## Personalization

Pass a profile id and events with a by-ID fetch to let XDA evaluate personalization while resolving the Experience:

```ts
const plan = await request.fetchExperience({
  experienceId,
  personalization: {
    profileId,
    events: [
      experiences.eventBuilder.buildIdentify({ userId }),
      experiences.eventBuilder.buildPageView(),
    ],
  },
});
```

Personalization is request data rather than request-context state. Supplying it switches the XDA call to POST. To request a source map in the same call, add `extensions: { sourceMap: {} }`. Enabling or disabling automatic optimization behavior is outside this contract.

## Request-scoped events

Event methods live on the request facade, never on the process-long SDK instance. Supply the
current profile and request-derived event values when creating the facade; event calls update that
facade's profile without affecting concurrent requests.

```ts
const experienceRequest = experiences.forRequest({
  locale: requestLocale,
  profile: currentProfile,
  eventContext: { page: pageProperties, userAgent },
  eventConsent: hasAnalyticsConsent,
});

await experienceRequest.identify({ userId });
// Persist experienceRequest.profile if your application stores profiles between requests.

await experienceRequest.track({ event: 'checkout_started' });
await experienceRequest.trackClick({
  entityId: 'checkout-button',
  entityKind: 'InlineComponent',
});
```

`identify`, `page`, and `track` update the request profile from the Optimization API response.
`trackView`, `trackClick`, `trackHover`, and `trackFlagView` send Insights events and require a
current profile; otherwise they throw `EventProfileRequiredError`. Event locale precedence is the
runtime default, `eventContext.locale`, `forRequest({ locale })`, then a method's explicit `locale`.
`eventConsent`, when provided, annotates `context.gdpr.isConsentGiven`; it does not gate sending.
There is no request event queue: await `identify`, `page`, or `track` before
starting another profile-producing or Insights call on the same request facade.

## Precedence

For settings that occur at more than one scope, later scope wins:

| Value                            | Precedence                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `locale` for an experience fetch | constructor fallback → `forRequest()` context → `fetchExperience()` options                                   |
| `metadata`                       | constructor defaults → `forRequest({ resolveOptions })` → method `resolveOptions`; objects are shallow-merged |
| `debug`                          | constructor default → request `resolveOptions` → method `resolveOptions`                                      |
| `initialViewportId`              | request `resolveOptions` → method `resolveOptions`                                                            |

`false` remains meaningful for `debug`: the SDK uses nullish fallback rather than truthiness.

## Delivery, preview, and destinations

`fetchExperience({ experienceId })` uses the delivery client by default. Pass `preview: true` to use the preview client configured on the singleton:

```ts
const draft = await request.fetchExperience({
  experienceId,
  preview: true,
});
```

Preview is available only for by-id experience fetches. If the singleton has no `preview` client, `preview: true` throws an error. The destination endpoints remain delivery-only:

```ts
const result = await request.fetchByDestinationPath({
  destinationId,
  path: requestPath,
});

if ('redirect' in result) {
  // Route using result.redirect.path.
} else {
  // result is a PortableRenderPlan.
}
```

Destination node and path requests do not use locale or environment identifiers because the upstream endpoints do not accept them. They still use request-scoped resolve settings such as metadata, debug, and viewport selection.

For either delivery or preview, transport configuration is trusted: the bearer
token is sent to the endpoint selected by that configuration. `environmentId`
is the Contentful environment identifier used by by-ID requests; it is not the
generated delivery client's optional `environment` endpoint setting. The
Experiences `host` option maps to the generated client's `baseUrl`, while a raw
`ContentfulViewDeliveryClient` can use `baseUrl` directly for a trusted custom
endpoint. Explicit `host`/raw-client `baseUrl` wins over generated-client
`environment`, which wins over the delivery or preview default. Direct CPA
preview fetches are distinct from Preview Session live updates, which are owned
by `@contentful/experiences-live-preview`.

The runtime owns its Optimization API client. Configure trusted custom
`experienceBaseUrl` or `insightsBaseUrl` endpoints through the constructor's
`optimization` options; those endpoints receive complete event and profile
payloads, so use only trusted HTTPS origins outside explicit local development.

## Errors

`NotFoundError` is re-exported for missing Experiences. Other delivery and resolution errors propagate to the caller, allowing your framework to apply its normal error handling.

```ts
import { NotFoundError } from '@contentful/experiences-node';

try {
  return await request.fetchExperience({ experienceId });
} catch (error) {
  if (error instanceof NotFoundError) {
    // Use the framework's not-found response.
  }
  throw error;
}
```

## Request isolation

Do not store a request facade beyond the request that created it. Each `forRequest()` call returns a separate object with its own locale and resolve options; concurrent requests do not share those values.

`forRequest()` is the only event-triggering surface. The long-lived class retains stable transport
configuration and a context-free base `EventBuilder`; it does not retain request profiles, locale,
page, user-agent, consent, or other request-sensitive event state.

## Architecture boundary

This package is a public Node-specific leaf over the internal `@contentful/experiences-client` and `@contentful/experiences-sdk-core` packages. Client stays runtime-neutral and stateless with respect to request and browser state: its shared runtime retains only stable configuration, reusable delivery and Optimization transports, and a base `EventBuilder` configured with an explicit platform channel. The Node SDK binds event behavior and volatile profile state to each request facade. `@contentful/experiences-web` is its public sibling over the same lower layers, not a subclass of this Node SDK: it owns browser state while inheriting the shared runtime's trusted transport and direct by-ID preview capabilities.

## License

MIT. See the repository [`LICENSE`](../../LICENSE) and [`NOTICE`](../../NOTICE) for full attribution.
