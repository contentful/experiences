# @contentful/experiences-nextjs

Next.js adapter for Contentful Experiences. The adapter exposes shared React rendering APIs and explicit Node request utilities through separate entries. Install this package with Next.js 15.5 and React 19:

```sh
npm install @contentful/experiences-nextjs next@^15.5.0 react@^19.0.0 react-dom@^19.0.0
```

The package is ESM and preserves per-file client boundaries. The root entry has no runtime exports; choose a subpath:

| Entry                  | Available APIs                                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/server`              | Public React server renderer, registry helpers and types, free Delivery fetch/client functions, resolver, design utilities, attribution helpers, event builder, and the common server utilities below. |
| `/client`              | Public React client renderer, render-context and design hooks, supplied-payload `useExperiencePlan`, and shared rendering helpers and types. Marked `'use client'`.                                    |
| `/custom-renderer`     | `resolveNodeProps`, `NodeSnapshot`, `ResolvedNode`, `ExperienceNode`, `ExperienceNodeProps`, and `createExperienceNode`.                                                                               |
| `/tracking-attributes` | `getTrackingAttributes`, `TrackingAttributes`, `TRACKING_SCOPES_ATTRIBUTE`, and `TRACKING_CLICKABLE_ATTRIBUTE`.                                                                                        |
| `/request-handler`     | `createNextjsExperiencesContextHandler` and its option/resolver types for context-only Node middleware.                                                                                                |
| `/package.json`        | Package metadata.                                                                                                                                                                                      |

For server rendering, fetch and resolve a plan using your application-owned registry, then pass it as `experience`:

```tsx
import { fetchExperience, ServerExperienceRenderer } from '@contentful/experiences-nextjs/server';
import { experienceConfig } from './experience-config';

export default async function ExperiencePage() {
  const experience = await fetchExperience(
    {
      spaceId: process.env.CONTENTFUL_SPACE_ID!,
      environmentId: 'master',
      experienceId: 'my-experience',
      locale: 'en-US',
    },
    { accessToken: process.env.CONTENTFUL_DELIVERY_TOKEN! },
    { config: experienceConfig }
  );

  return <ServerExperienceRenderer experience={experience} config={experienceConfig} />;
}
```

In a Client Component, import `ExperienceRenderer` from `@contentful/experiences-nextjs/client` and pass the same `experience` and browser rendering registry. Custom renderers can import the composition primitives from `/custom-renderer` and spread attributes from `/tracking-attributes` onto their rendered elements. See the [React adapter](../adapter-react/README.md) for registration, design props, slots, and supplied-plan rendering contracts.

Normal entries and declarations do not require the optional Live Preview package. The `/server` entry does not load the live Web SDK. The server utilities use the public Node SDK. Only `/request-handler` imports `next/server`; `/server` never reads `next/headers` or cookies implicitly.

## Explicit request binding

`configureNextjsServerExperiences(config: ExperiencesNodeConfig)` returns the actual Node SDK with stable configuration. It does not force private fetch options, read request state, submit events, or load content. `bindNextjsExperiencesRequest(sdk, options)` calls `forRequest()` once and returns the actual `ExperiencesNodeRequest` directly, with its normal fetch, resolve, destination, event and `destroy()` methods.

```ts
import {
  configureNextjsServerExperiences,
  bindNextjsExperiencesRequest,
  createNextjsPrivateFetch,
  applyNextjsPrivateResponseCache,
  persistNextjsAnonymousId,
} from '@contentful/experiences-nextjs/server';

const sdk = configureNextjsServerExperiences({
  spaceId: process.env.CONTENTFUL_SPACE_ID!,
  environmentId: 'master',
  delivery: {
    accessToken: process.env.CONTENTFUL_DELIVERY_TOKEN!,
    fetch: createNextjsPrivateFetch(),
  },
});

// The host supplies these values from its supported request boundary.
const request = bindNextjsExperiencesRequest(sdk, {
  consent: visitorConsent,
  request: incomingRequest,
  locale: requestLocale,
  experienceOptions: { ip: hostTrustedIp },
});
try {
  const plan = await request.fetchExperience(
    { experienceId: 'home' },
    { config: experienceConfig }
  );
  // At a writable response boundary, after evaluation and before sending headers:
  applyNextjsPrivateResponseCache(response);
  persistNextjsAnonymousId(response, request);
  // Render plan independently of event delivery or profile finalization.
} finally {
  request.destroy();
}
```

`consent` is required and independent of any cookie. Cookie identity is read only when persistence consent is explicitly granted (`true` or `{ persistence: true }`). An explicitly supplied `profile` takes precedence and can remain volatile without persistence consent. An explicit `cookies` reader takes precedence over effective `headers`, then request cookies/header. Empty supplied cookies or headers are authoritative and cannot restore an identity removed by the host. Preview (`isPreview: true` or `livePreview`) excludes every visitor profile input and never reads identity cookies. The preview configuration passes unchanged to Node; optional Preview remains lazy and SDK-owned.

All Node request context options are accepted, including `resolveOptions`, `experienceOptions`, `insightsOptions` and `livePreview`. The helpers infer no IP from `Forwarded` or `X-Forwarded-For`; trusted IP policy belongs in `experienceOptions.ip`. Explicit headers are authoritative. Page context precedence is the request URL (or the forwarded URL when no request is supplied), then `eventContext.page`, then explicit `page`. Explicit `locale` overrides event-context locale; explicit event-context `userAgent` overrides the header.

`createNextjsPageContext({ path, origin?, url?, searchParams?, referrer? })` accepts `URLSearchParams` or Next search-param records containing strings/arrays. The supplied `path` determines `page.path`; `searchParams` determines `page.search` and `page.query`, preserving ordered duplicate values in `search` and the last string for each query key. Explicit `url` overrides only `page.url` and is returned unchanged, including its encoding and hash. Without `url`, the helper builds it from path/search and optional origin. `createNextjsRouteKey(url)` separately removes `_rsc` and the hash and canonicalizes spaces so `%20` and `+` match. The host retains its base-path, locale-prefix and trailing-slash policy. `createNextjsRequestContext(options)` parses the actual request or supplied forwarded URL into derived pathname/search/query and returns the parsed URL's `toString()` in `page.url`, without framework reads or transport filtering. Derived search retains its original encoding and `_rsc`, and the derived URL retains its hash; Next transport normalization belongs to route keys and the sanitized middleware forwarding boundary. These helpers omit derived page title; explicit caller context remains caller-owned.

## Response cookies and private caching

`applyNextjsPrivateResponseCache(response)` applies `Cache-Control: private, no-store`; `persistNextjsAnonymousId(response, request, options?)` appends identity `Set-Cookie` using the request's current profile. Binding has no response persistence closure and accepts no `cookieOptions` or `deleteWhenProfileCannotPersist`; `anonymousIdCookieName` on binding controls identity lookup only. Supply response cookie options to the standalone helper or context middleware. For `NextResponse`, it uses the cookie jar so later application `cookies.set()` calls retain SDK identity and withdrawal also updates middleware cookie forwarding. Plain responses use the header fallback. It preserves other cookies, `Vary` and other headers. Call it only where headers are writable: a Route Handler, Server Action response or middleware response, never during Server Component rendering. A cookie or provisional XDA ID is not proof of committed profile state.

The standalone `createNextjsAnonymousIdSetCookieHeader(request, options?)` and `persistNextjsAnonymousId(response, request, options?)` expose the cookie decision without changing cache headers. Options are `anonymousIdCookieName`, `cookieOptions` (`path`, `domain`, `sameSite`, `secure`, `httpOnly`, `expires`, `maxAge`) and `deleteWhenProfileCannotPersist`. The latter defaults to `true`, following Optimization; set it to `false` when the host does not own withdrawal deletion at this boundary. Deletion uses the same configured path/domain. Defaults are `ctfl-opt-aid`, path `/`, and `SameSite=Lax`. Standalone cookie helpers retain configurable `httpOnly` for server-scoped identity. Preview never writes or expires identity. No profile means no new cookie.

`createNextjsPrivateFetch(customFetch?)` preserves the custom fetch implementation, input, authorization, method, body, headers and abort signal while overriding cache with `no-store`. It removes positive or indefinite (`false`) Next `revalidate` conflicts and preserves other Next options. Install it only in host-assembled private `delivery.fetch` and, when needed, direct CPA `preview.fetch` configuration. `applyNextjsPrivateResponseCache(response)` sets private/no-store headers without replacing `Vary`. The Preview Session helper has no custom-fetch injection; run session work outside cached functions on a dynamic no-store route.

## Browser serialization

`serializeNextjsPlan(plan, { metadataKeys? })` returns a detached browser plan. It sets `diagnostics: []`, omits `deliveryDiagnostics` and personalization, and defaults `metadata` to `{}`. Explicit `metadataKeys` allow only selected metadata fields. Nodes, slots, attribution and source maps remain intact. Known absent SDK structural optional fields are projected explicitly; customer content/design/resolved records and approved metadata remain strict JSON data. Server diagnostics remain available on the original plan.

`serializeNextjsHandoff(handoff, { spaceId, environmentId })` delegates scope, cache and envelope validation to Node's canonical parser. Use the actual Node producer's complete result even when it contains an error and no plan. The serializer retains profile ID, evaluated message IDs, event order/bodies, route key and replay locale; complete profile state is preserved for the request-scoped browser handoff. It explicitly omits absent SDK context optionals emitted by builders, including nested page context fields, page-event properties, campaign and location optionals, while preserving all defined fields and raw query arrays. Customer event properties and traits remain strict JSON data. It creates no new wire DTO or events and is not an untrusted replay admission API; producer and browser owners retain their batch/schema/count/lifetime checks. Handoff bodies are browser-visible: do not include secrets, cache, log or persist them.

All transferred application data must be JSON-safe. Functions, symbols, bigint, cycles, non-finite numbers, unsupported class instances and arbitrary `undefined` fields throw path-specific `TypeError`s. `serializeNextjsJsonForHtml(value)` performs strict validation and escapes `<`, U+2028 and U+2029 for a JSON script body. Ordinary React markup uses normal React escaping.

## Explicit public and static use

Stable configuration remains usable for static/ISR/public rendering without request reads or a private fetch wrapper. Call `assertNextjsPublicRequestPolicy({ cache, context?, fetchOptions? })` with the exact context and fetch options that the host will use. Policy must be explicit: `{ scope: 'static' }` or `{ scope: 'public-permutation', key }`. Public permutation keys must be nonempty and application-complete: include content identity/revision, space/environment, locale, parameters and every selection dimension. The validator cannot prove key completeness; the application owns it and actual cache configuration.

Public/static requests exclude profile/identity, personalization events, replay and preview. The validator rejects private request inputs; canonical handoff validation rejects any identity/state/replay in public/static handoffs. Do not bind an incoming visitor request or apply private response caching/cookie persistence on the public/static path. Use explicit `sdk.forRequest({ consent: false, locale })` or the existing free fetch function after validating policy. A supplied plan and cache metadata do not themselves configure Next's Data Cache or response caching. There is no additional SDK cache framework.

## Context-only middleware and request reuse

Import `createNextjsExperiencesContextHandler` from `/request-handler`. With no options it sanitizes and forwards context only. With `{ sdk, consent, ...requestOptions }`, `consent` may be a value or resolver receiving `{ request, headers, cookies }`. Optional `livePreview: NextjsLivePreviewResolver` receives `{ request }` and returns a Node `RuntimeLivePreviewOptions` or `undefined`, synchronously or asynchronously; both resolvers run before binding. The existing static `isPreview` option remains available. Explicit `bindNextjsExperiencesRequest` accepts the preview configuration unchanged; the handler accepts the application resolver. Resolver failure aborts binding and cookie work.

The handler follows Optimization's pinned Next request-header override mechanics. It honors effective overrides and removed cookies, strips incoming `x-ctfl-exp-*` headers, and sets `x-ctfl-exp-request-url` from the actual normalized request URL. It preserves existing rewrites, response headers/cookies and terminal redirect/error/body responses. Terminal responses skip resolvers and binding. Handler options separately accept the standalone cookie persistence options. At persistence, middleware forces `cookieOptions.httpOnly: false` for shared browser identity, including withdrawal, even when the input sets it to `true`. Configured context binding applies private response caching, persists only the identity already available and destroys its direct local request in `finally`; middleware does not fetch content, submit page/identify events, prepare replay or make commits a prerequisite. The `/request-handler` entry uses Node; it is not an Edge binder. Only trust forwarded URL context from a boundary that runs this sanitization.

Memoization belongs to the host. A stable React `cache` callback can share one actual descriptor load promise and its complete Node result across presentation/root, including failures:

```ts
import { cache } from 'react';
import {
  bindNextjsExperiencesRequest,
  createNextjsRouteKey,
} from '@contentful/experiences-nextjs/server';

const loadExperience = cache(async () => {
  const request = bindNextjsExperiencesRequest(sdk, explicitRequestOptions);
  try {
    return await request.fetchExperienceForHandoff(
      actualDescriptor,
      { config: experienceConfig },
      { routeKey: createNextjsRouteKey(explicitRequestUrl) }
    );
  } finally {
    request.destroy();
  }
});
// Presentation and the optional browser root call this same callback.
// Display result.plan independently; only an actual transfer forwards result.handoff.
```

This load owns its direct request through completion and returns the unchanged Node result. For ordinary SSR, share the ordinary `request.fetchExperience` promise instead. If the host also persists identity, keep the request in its host request lifetime, call the standalone cache/cookie helpers at the supported response boundary, and destroy it when that lifetime ends, including failures. Comparison IDs remain ordinary event-free host fetches, without SDK cross-fetch guarantees. The package introduces no memoization/resource API. App/Pages router binders and browser takeover belong to Phase 10; configured browser defaults do not come from server consent snapshots.

## Development

From the workspace root, after installing dependencies:

```sh
npx nx build adapter-nextjs
npx nx test adapter-nextjs
npx nx lint adapter-nextjs
npx nx typecheck adapter-nextjs
npx nx run adapter-nextjs:pack
```

Build and test targets follow the React adapter's tsup/Vitest setup. Lint and typecheck are inferred by the workspace Nx plugins; packing uses `scripts/pack-package.ts`. Package tests check the built exports, client directive, Node ESM imports, declaration compatibility, and server/preview dependency boundaries without network requests or a consumer project.
