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

`forRequest()` intentionally has no event methods or request-bound builder in this lean interim. The long-lived class still inherits Client's context-free base `EventBuilder`; the Node SDK does not add request state or request-specific behavior to that lower-level surface. Operational event methods will be separate additive work.

## Architecture boundary

This package is a public Node-specific leaf over the internal `@contentful/experiences-client` and `@contentful/experiences-sdk-core` packages. Client stays runtime-neutral and stateless with respect to request and browser state: its shared runtime retains only stable configuration, reusable delivery transports, and a base `EventBuilder` configured with an explicit platform channel. The Node SDK does not add a request-bound event facade in this interim. `@contentful/experiences-web` is its public sibling over the same lower layers, not a subclass of this Node SDK: it owns browser state while inheriting the shared runtime's trusted transport and direct by-ID preview capabilities.

## License

MIT. See the repository [`LICENSE`](../../LICENSE) and [`NOTICE`](../../NOTICE) for full attribution.
