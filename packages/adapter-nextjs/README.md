# @contentful/experiences-nextjs

Next.js adapter for Contentful Experiences. The normal integration automatically
fetches, resolves and manages one primary Experience using App Router or Pages
Router request bindings and built-in browser roots. Explicit Node request and
supplied-plan rendering utilities remain available. Install this package with
Next.js 15.5 and React 19:

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
| `/app-router/server`   | `bindNextjsAppRouterServerExperiences`, request-aware server components and explicit/static rendering.                                                                                                 |
| `/app-router/client`   | `bindNextjsAppRouterClientExperiences`, `NextjsAppRouterRequestRoot`, `NextjsAppRouterRequestAnalyticsRoot`, managed/injected content and server children.                                             |
| `/pages-router/server` | `bindNextjsPagesRouterServerExperiences` and its native request/response helper.                                                                                                                       |
| `/pages-router`        | `bindNextjsPagesRouterExperiences`, Web components, request components and standalone request roots.                                                                                                   |
| `/cache-middleware`    | Edge-compatible `createNextjsPublicPermutationCacheMiddleware`; no Node SDK or event work.                                                                                                             |
| `/package.json`        | Package metadata.                                                                                                                                                                                      |

## Automatic single-Experience setup

Bind the server registry and one `request.experience` once. The binder owns the
primary fetch, resolution and request lifetime; a request root and presentation
share its complete result. Repeated presentations can render its plan without
another fetch. Multiple-fetch ordering, identity and results remain
application-owned diagnostic behavior; there is no declarative multi-prefetch,
result list, identity reconciliation or additional cache/controller/barrier.

### App Router

Export named components from `binding.request` in the binding modules, then import
and render those names in pages (`<ExperiencesRoot>` and `<Experience>`). Bind the
configuration once. The default server binding renders content on the server and uses
the built-in browser root:

```tsx
// lib/experience-server.tsx
import 'server-only';
import { bindNextjsAppRouterServerExperiences } from '@contentful/experiences-nextjs/app-router/server';
import { createNextjsPrivateFetch } from '@contentful/experiences-nextjs/server';
import { serverRegistry } from './server-registry';

export const binding = bindNextjsAppRouterServerExperiences({
  spaceId: process.env.CONTENTFUL_SPACE_ID!,
  environmentId: 'master',
  locale: 'en-US',
  delivery: {
    accessToken: process.env.CONTENTFUL_DELIVERY_TOKEN!,
    fetch: createNextjsPrivateFetch(),
  },
  config: serverRegistry,
  browser: {
    delivery: { accessToken: process.env.NEXT_PUBLIC_CONTENTFUL_DELIVERY_TOKEN! },
    isPreview: false,
  },
  consent: { server: false }, // Replace with the application's request consent policy.
  request: {
    experience: { experienceId: 'home' },
    resolveOptions: { debug: false },
  },
});

export const { ExperiencesRoot, Experience } = binding.request;
```

```ts
// middleware.ts — Node middleware, context forwarding only.
import { createNextjsExperiencesContextHandler } from '@contentful/experiences-nextjs/request-handler';

export const middleware = createNextjsExperiencesContextHandler();
export const config = { runtime: 'nodejs', matcher: ['/'] };
```

```tsx
// app/page.tsx
import { ExperiencesRoot, Experience } from '../lib/experience-server';

export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <ExperiencesRoot>
      <Experience />
    </ExperiencesRoot>
  );
}
```

There are three compositions, selected by the components you render:

1. **Server evaluation and rendering:** use the server binding's
   `request.ExperiencesRoot` and `request.Experience` as above. The bound
   `Experience` always uses `ServerExperienceRenderer`. Use
   `request.ExperiencesAnalyticsRoot` for opaque server children with browser
   analytics; it retains the handoff while omitting the plan from browser props.
   Content and preview updates use server round-trips. Analytics-only browser
   owners still require Delivery configuration under the Runtime constructor contract.
2. **Server evaluation and browser-managed presentation:** call the server's
   `request.loadExperience()`, then pass the same complete result to a client
   binding's `request.ExperiencesRoot` and `request.Experience`. The supplied plan
   survives activation without a startup Web fetch. Update the root and presentation
   result together on navigation; no duplicate browser fetch is needed.
3. **Web evaluation and presentation:** render a client binding's
   top-level `ExperiencesRoot` and `Experience` with
   `experienceId` and fetch options. Web owns loading and navigation. The existing
   `initialPlan` input can seed the first render; an unseeded client component does
   not fetch content during server rendering.

For the second composition, export both client-bound request components:

```tsx
// lib/experience-client.tsx
'use client';

import { bindNextjsAppRouterClientExperiences } from '@contentful/experiences-nextjs/app-router/client';
import { browserRegistry } from './browser-registry';

const binding = bindNextjsAppRouterClientExperiences({
  config: browserRegistry,
  spaceId: process.env.NEXT_PUBLIC_CONTENTFUL_SPACE_ID!,
  environmentId: 'master',
  locale: 'en-US',
  delivery: { accessToken: process.env.NEXT_PUBLIC_CONTENTFUL_DELIVERY_TOKEN! },
});
export const { ExperiencesRoot, Experience } = binding.request;
```

```tsx
// app/page.tsx — alternative to the default server-rendered composition above.
import { serializeNextjsRequestResult } from '@contentful/experiences-nextjs/app-router/server';
import { binding } from '../lib/experience-server';
import { ExperiencesRoot, Experience } from '../lib/experience-client';

export default async function Page() {
  const result = serializeNextjsRequestResult(await binding.request.loadExperience());
  return (
    <ExperiencesRoot result={result}>
      <Experience result={result} />
    </ExperiencesRoot>
  );
}
```

### Pages Router

Bind the same server policy once with `bindNextjsPagesRouterServerExperiences`
from `/pages-router/server`; supply an explicit trusted `origin` for host-independent
page URLs. Bind the browser registry and flat browser SDK options in a client
configuration module, then export the named components once. Import
`ExperiencesRoot` into `_app` and `Experience` into the page. Keep private server
configuration and imports inside the GSSP server dependency path.

```tsx
// lib/pages-experience-server.tsx — consumed only by getServerSideProps.
import { bindNextjsPagesRouterServerExperiences } from '@contentful/experiences-nextjs/pages-router/server';
import { createNextjsPrivateFetch } from '@contentful/experiences-nextjs/server';
import { serverRegistry } from './server-registry';

export const pagesExperiences = bindNextjsPagesRouterServerExperiences({
  spaceId: process.env.CONTENTFUL_SPACE_ID!,
  environmentId: 'master',
  locale: 'en-US',
  origin: process.env.APP_ORIGIN!,
  delivery: {
    accessToken: process.env.CONTENTFUL_DELIVERY_TOKEN!,
    fetch: createNextjsPrivateFetch(),
  },
  config: serverRegistry,
  consent: { server: false }, // Supply the application's request consent policy.
  request: { experience: { experienceId: 'home' } },
});
```

```tsx
// lib/pages-experience-client.tsx
'use client';

import { bindNextjsPagesRouterExperiences } from '@contentful/experiences-nextjs/pages-router';
import { browserRegistry } from './browser-registry';

const binding = bindNextjsPagesRouterExperiences({
  config: browserRegistry,
  spaceId: process.env.NEXT_PUBLIC_CONTENTFUL_SPACE_ID!,
  environmentId: 'master',
  locale: 'en-US',
  delivery: { accessToken: process.env.NEXT_PUBLIC_CONTENTFUL_DELIVERY_TOKEN! },
  isPreview: false,
  consent: { clientDefaults: { consent: false, persistenceConsent: false } },
  cookie: { path: '/', sameSite: 'lax' },
});
export const { ExperiencesRoot, ExperiencesAnalyticsRoot, Experience } = binding.request;
```

```tsx
// pages/index.tsx
import type { GetServerSideProps } from 'next';
import type { NextjsRequestResult } from '@contentful/experiences-nextjs/pages-router/server';
import { pagesExperiences } from '../lib/pages-experience-server';
import { Experience } from '../lib/pages-experience-client';

export const getServerSideProps: GetServerSideProps<{ result: NextjsRequestResult }> = async (
  context
) => {
  const result = await pagesExperiences.request.loadExperience(context);
  return { props: { result } };
};

export default function Page({ result }: { result: NextjsRequestResult }) {
  return <Experience result={result} />;
}
```

```tsx
// pages/_app.tsx — one stable built-in browser owner.
import type { AppProps } from 'next/app';
import { ExperiencesRoot } from '../lib/pages-experience-client';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ExperiencesRoot result={pageProps.result}>
      <Component {...pageProps} />
    </ExperiencesRoot>
  );
}
```

App hosts project raw results with `serializeNextjsRequestResult`; Pages GSSP
returns JSON-safe results directly. Pass each complete result, including its
`requestId`, to the client request root and presentation without overlays.
Private configuration, raw errors and unapproved metadata remain server-local.

App server roots share render-local memoization. Place roots that need fresh
handoffs in a rerendering page or template; retained layouts do not reevaluate.
Next owns prefetching and caching. Extend the context middleware matcher to all
App request-aware routes. Pages maps the native GSSP context instead.

For opaque server content, use the client `request.ExperiencesAnalyticsRoot`
(or standalone Pages analytics root) and omit the plan from browser props while
preserving the handoff. The application owns server rendering and round-trips.
Analytics-only browser owners still require Delivery configuration.

For manual views, wrap the selected server subtree with `ManualViewTracking` from
`@contentful/experiences-nextjs/client`. For App RSC, re-export it by name from the
existing client configuration module, as with the request root components, and
import that named export in the server component. Its DOM marker survives App RSC and
Pages HTML serialization. The Web SDK selects attribution and owns registration
lifecycle; the browser does not take over Experience rendering. Preserve the
rendered scope/attribution attributes and request a source map. See the
[React manual-view boundary](../adapter-react/README.md#attributed-rendering-and-dom-roots) for behavior.

Browser credentials are explicit browser-visible credentials. The designated
public token above must have appropriate scope and endpoint CORS; otherwise use
`delivery: { host: 'https://your-app.example/api/delivery' }` in the Pages client
binding (or `browser.delivery` in App server configuration) and implement that
trusted proxy's upstream authentication. Built-in App roots inherit server
scope and locale but never copy private server Delivery/Preview tokens. Browser
defaults use `consent.clientDefaults`, independently of request consent. Literal
browser configuration is JSON-safe; functions, custom fetch and preview
configuration requires the advanced client-module binding described below.

The maintained [Next reference](../../implementations/nextjs-sdk/README.md) shows
`/single-experience` and `/pages/single-experience` beside its diagnostics.
Phases 10 and 11 are complete and accepted; reference parity validation is Phase 12; the broader
`examples/nextjs` migration remains Phase 14.

## Managed Contentful Live Preview

Install the optional `@contentful/experiences-live-preview` package and configure
the server and client bindings with a lazy loader. Normal SDK imports and
declarations remain independent of that package.

```ts
// lib/live-preview.ts — shared configuration, with no credentials.
export const livePreview = {
  enabled: process.env.NEXT_PUBLIC_CONTENTFUL_LIVE_PREVIEW_ENABLED === 'true',
  loadImplementation: () => import('@contentful/experiences-live-preview'),
};
```

For App Router, export the client request root as well as the presentation:

```tsx
// lib/experience-client.tsx
'use client';
import { bindNextjsAppRouterClientExperiences } from '@contentful/experiences-nextjs/app-router/client';
import { browserRegistry } from './browser-registry';
import { livePreview } from './live-preview';

const binding = bindNextjsAppRouterClientExperiences({ config: browserRegistry, livePreview });
export const { ExperiencesRoot, Experience } = binding.request;
```

Add `livePreview` and `preview: { accessToken: process.env.CONTENTFUL_PREVIEW_TOKEN! }`
to the existing App server configuration. Set an explicitly browser-visible
`browser.preview` token separately; the frozen Preview Session helper requires
one even when Delivery uses a trusted proxy. Use the server load/serialization and
client request components shown in the browser-managed composition above; server
`request.Experience` retains `ServerExperienceRenderer`. Keep context-forwarding
middleware on the request-aware routes.

For Pages, add the same `livePreview` and private Preview token to the server
binder; add `livePreview` and the separately designated browser Preview token to
`bindNextjsPagesRouterExperiences`. GSSP, `_app` and `<Experience result={result} />`
stay as shown above. Both server families carry only loader-free configuration
in the existing result; browser roots retain their client loader and derive the
primary ID and nonempty trimmed `preview_session_id` from the descriptor and route.
Result-backed roots infer the Preview target from their result. Advanced Web-owned
Preview can supply `livePreview.experienceId`; shared roots have no content-ID prop.
Optional `sessionHost` and `resourceResolution` belong to the configuration.

Disabled policy or a missing session selects ordinary mode. Active sessions load
the optional implementation, retain initial server plans without a startup refetch,
and use existing `replaceLivePreview` for session changes. Mode entry/exit replaces
the owned SDK below the request-history guard. No consumer preview wrapper, hook
or key is needed. Errors appear in `states.preview`; analytics roots observe
revisions for server refresh without browser resolution. This controls Contentful
Live Preview content and event suppression, independently of XPAPI preflight.
Explicit preview options and application resolvers remain available; injected SDK lifetime stays
application-owned and does not accept managed configuration.

## Explicit supplied-plan rendering

For application-owned server fetching, fetch and resolve a plan using your registry, then pass it as `experience`:

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

Normal entries and declarations do not require the optional Live Preview package. The `/server` entry does not load the live Web SDK. The server utilities use the public Node SDK. The explicit `/server` entry never reads framework headers or cookies. Request reads are confined to the opt-in App Router server family. `/request-handler` uses Node middleware; `/cache-middleware` supports Edge routing.

## Explicit request binding

`configureNextjsServerExperiences(config)` accepts the Node SDK's `Config` from
`@contentful/experiences-node` and returns the actual Node SDK with stable configuration. It does not force private fetch options, read request state, submit events, or load content. `bindNextjsExperiencesRequest(sdk, options)` calls `forRequest()` once and returns the actual `RequestRuntime` directly, with its normal fetch, resolve, destination, event and `destroy()` methods.

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
  personalizationOptions: { ip: hostTrustedIp },
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

All Node request context options are accepted, including `resolveOptions`, `personalizationOptions`, `analyticsOptions` and `livePreview`. The helpers infer no IP from `Forwarded` or `X-Forwarded-For`; trusted IP policy belongs in `personalizationOptions.ip`. Explicit headers are authoritative. Page context precedence is the request URL (or the forwarded URL when no request is supplied), then `eventContext.page`, then explicit `page`. Path-style `page` input inherits an omitted referrer and URL origin from the merged lower-precedence context; its explicit path/search and URL/origin/referrer options take precedence, including an empty referrer. Explicit `locale` overrides event-context locale; explicit event-context `userAgent` overrides the header.

`createNextjsPageContext({ path, origin?, url?, searchParams?, referrer? })` accepts `URLSearchParams` or Next search-param records containing strings/arrays. The supplied `path` determines `page.path`; `searchParams` determines `page.search` and `page.query`, preserving ordered duplicate values in `search` and `query`. A query key with one value maps to a string; repeated keys map to ordered string arrays. Explicit `url` overrides only `page.url` and is returned unchanged, including its encoding and hash. Without `url`, the helper builds it from path/search and optional origin. `createNextjsRouteKey(url)` separately removes `_rsc` and the hash and canonicalizes spaces so `%20` and `+` match. The host retains its base-path, locale-prefix and trailing-slash policy. `createNextjsRequestContext(options)` parses the actual request or supplied forwarded URL into derived pathname/search/query and returns the parsed URL's `toString()` in `page.url`, without framework reads or transport filtering. Derived search retains its original encoding and `_rsc`, and the derived URL retains its hash; Next transport normalization belongs to route keys and the sanitized middleware forwarding boundary. These helpers omit derived page title; explicit caller context remains caller-owned.

## Response cookies and private caching

`applyNextjsPrivateResponseCache(response)` applies `Cache-Control: private, no-store`; `persistNextjsAnonymousId(response, request, options?)` appends identity `Set-Cookie` using the request's current profile. Binding has no response persistence closure and accepts no `cookieOptions` or `deleteWhenProfileCannotPersist`; `anonymousIdCookieName` on binding controls identity lookup only. Supply response cookie options to the standalone helper or context middleware. For `NextResponse`, it uses the cookie jar so later application `cookies.set()` calls retain SDK identity and withdrawal also updates middleware cookie forwarding. Plain responses use the header fallback. It preserves other cookies, `Vary` and other headers. Call it only where headers are writable: a Route Handler, Server Action response or middleware response, never during Server Component rendering. A cookie or provisional XDA ID is not proof of committed profile state.

Next's response cookie jar is keyed by name. The helper restores raw `Set-Cookie` headers at other domain/path scopes, including expiration headers, but later application jar writes can discard those raw headers again. Finish jar writes before appending raw multi-scope headers and calling this helper.

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

Scope a configured handler to personalized document routes. Applying it to static assets, public pages or unrelated API routes also applies private/no-store caching and cookie persistence there. Exclude those routes with the host's middleware matcher; the handler does not infer document routes. For example:

```ts
// middleware.ts — extend only to document routes that need visitor binding.
export const config = { runtime: 'nodejs', matcher: ['/', '/page-two'] };
```

The App Router request family owns routine memoization. Explicit hosts may still use a stable React `cache` callback to share one actual descriptor load promise and its complete Node result across presentation/root, including failures:

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

This load owns its direct request through completion and returns the unchanged Node result. For ordinary SSR, share the ordinary `request.fetchExperience` promise instead. If the host also persists identity, keep the request in its host request lifetime, call the standalone cache/cookie helpers at the supported response boundary, and destroy it when that lifetime ends, including failures. Comparison IDs remain ordinary event-free host fetches, without SDK cross-fetch guarantees. The bound request family uses request-scoped React memoization internally; there is no public resource cache. Configured browser defaults do not come from server consent snapshots. Speculative, RSC and Pages data middleware requests forward context without binding or mutating identity cookies.

## Router bindings

Use `/app-router/server` and `/app-router/client` for the separate
`bindNextjsAppRouterServerExperiences` and `bindNextjsAppRouterClientExperiences`
families. Bind the server Node configuration and render registry once; configure
the browser registry and callbacks in a client module. `consent.server` resolves
independent request consent, while `consent.clientDefaults` configures Web defaults.

For RSC node rendering, server-only components use ordinary attribute forwarding.
Named root bindings (`root: { prop: 'experienceRoot' }`) require a component
exported from a `'use client'` module, or a client-bound `createExperienceNode`
receiving serializable snapshots. Slot JSX can cross this boundary; server-created
handlers and DOM refs cannot. See [React root bindings](../adapter-react/README.md#attributed-rendering-and-dom-roots).

The App server `request` family memoizes one primary Experience result for
`loadExperience`, `Experience`, `ExperiencesRoot` and `ExperiencesAnalyticsRoot`.
Request roots and presentations receive one JSON-safe `result: NextjsRequestResult`:
`requestId`, `routeKey`, event-free `experience`, optional `plan`, `handoff`,
`contentError` string, `initialPagePayload` and optional loader-free `livePreview` configuration. `requestId` distinguishes fresh results;
request presentations accept no descriptor or seed overlays. App's `request.loadExperience` also
retains server-local `experienceId` and raw `error`; browser projection excludes
those fields and sanitizes the optional plan. Analytics roots omit that plan for
opaque server children while preserving the handoff.
Only the App opt-in path reads `headers()`/`cookies()`; configure the sanitized request
handler first. `request.experience`, `initialEvents`, `pagePayload` and `resolveOptions`
can be request-context resolvers. `NextjsServerRequestPolicy` binds one primary request.
Document, RSC and Pages data requests evaluate the primary Experience on Node using the
transfer producer; preview uses ordinary fetch and suppresses events. Requests marked
as speculative (`next-router-prefetch`, `purpose` or `sec-purpose`) perform no primary
fetch or composition. Next.js can also issue full prefetches without those markers;
these follow the ordinary RSC path. Configure prefetching at the application boundary
when server evaluation must wait for navigation. Each actual non-preview server
load, document, RSC or Pages data, resolves `request.initialEvents` and `request.pagePayload`
and appends the automatic page event for XDA evaluation and browser replay.
Explicit `personalization.events` remains authoritative caller intent, including
`events: []` to suppress automatic page intent. The resolved `request.pagePayload`
also travels as `initialPagePayload` for browser fallback.
Each fresh server preparation can emit a page event, including a same-route
`router.refresh()`. Adopting the same exact result or prepared message IDs replays
only once; a fresh preparation has fresh event identity. Ordinary Web SDK retry and
refresh continue to use event-free fetches.
High-level `cookie: NextjsCookieConfig` matches Web's shared identity
attributes (`path`, `domain`, `sameSite`, `secure`, and `expires` in days); the
request/response adapter converts expiry to response cookie options. It uses the
shared `ctfl-opt-aid` identity name. Low-level standalone helpers retain their
explicit cookie-name and response options. Optional `request.composeRequest(request, primary, context)`
receives the same facade and raw primary plan/error/handoff after every actual
server primary fetch, including RSC and Pages data, before browser projection and cleanup. It does
not run for requests marked speculative. Diagnostic comparison ordering, identity changes, result handling and per-ID error
isolation remain application-owned. The callback is an escape hatch, not a
declarative prefetch/result list or SDK multi-Experience mechanism.
Callback exceptions propagate; cleanup still runs. Server rendering retains raw metadata.

Explicit no-page intent uses the existing `personalization.events: []` input.
It is retained in `result.experience.personalization.events: []`, and automatic
roots respect it for the matching result instead of synthesizing page intent.
No separate flag or payload overlay is needed. Explicit events are complete
caller intent; do not combine them with `request.initialEvents` or `request.pagePayload`.

The explicit server `Experience` accepts a supplied plan or a public/static
`experienceId` with explicit cache policy; it reads no framework context. Existing
explicit Node host helpers remain available for custom request boundaries.
Server functions and credentials stay outside client props.
The server request `Experience` uses `ServerExperienceRenderer`; its renderer cannot
be replaced by injecting a client `Experience` into the server binding. Root overrides
remain available. Browser renderer callbacks, DOM event handlers and custom container
components belong in the client binding. Both server `Experience` components support
server renderer callbacks. Custom root overrides own their preview refresh observer;
use the client binding's `request.ExperiencesAnalyticsRoot` when that root wraps
server-rendered content. Built-in server roots install their own matching observer.

Both client bindings expose ordinary `ExperiencesRoot`, `ExperiencesAnalyticsRoot`
and managed `Experience` for Web-owned flows, plus `ExperienceRenderer` and
`useManagedExperience`. Their separate `request` family exposes roots and an
`Experience` accepting the complete server `result`; top-level `Experience` has
no result overload. Supplied plans bind preview without a startup fetch.
Configure callbacks, function-valued options and preview in a client module.
While a supplied result is missing or mismatches the committed route, request
roots suppress page fallback, analytics and `beforeInitialPage` until adoption;
ordinary Web roots without results keep their existing behavior.

`ExperiencesAnalyticsRoot` accepts opaque server children. It calls the existing
SDK page operation for browser-owned initial intent and observes the SDK's active
Preview revision. Content updates use a server round-trip, with no
browser content fetch, resolution or renderer. Supplied aggregate admission remains
independent of display; there is no before-page no-op or compensating XDA commit.

For Pages, `/pages-router/server` exposes
`bindNextjsPagesRouterServerExperiences(config).request.loadExperience(ctx, overrides?)`.
Call it from native `getServerSideProps` after application redirect/error decisions.
Bind `config`, `request.experience`, `request.resolveOptions`,
`consent.server`, `consent.clientDefaults` and `cookie` once; per-call
`NextjsPagesRouterRequestOptions` provides explicit overrides. A trusted `origin`
is required on the binding or every `loadExperience` call. It must be an HTTP(S)
origin without credentials, path, query or hash; Host and forwarding headers never
select it. Existing integrations relying on header inference must add `origin`.
The visible path/query comes from `ctx.req.url`, with Next data URLs normalized to
page paths and hashes/`_rsc` removed. Rewrites retain the original visible URL,
rather than GSSP's resolved destination URL, so server results match browser
`asPath`. Next's native base-path/locale handling remains in effect.
For application-owned masked navigation, pass an explicit visible path/query as
`loadExperience(ctx, { routeKey: '/page?mode=server-only' })`; the original native
request and `ctx.resolvedUrl` remain available to application code for action or
destination routing. The override controls request/page context and result/handoff
identity together.
The helper maps the native request to one facade, evaluates one primary result,
persists the final permitted identity at writable `ctx.res`, then destroys its facade.
`request.composeRequest(request, primary, context)` receives the raw primary result
and normalized server context before projection/final cookie persistence/cleanup.
Its additional fetches, identity effects and result storage remain application-owned.
Exceptions propagate and cleanup still runs.

Pages `request.loadExperience` returns the JSON-safe `NextjsRequestResult` directly,
including `initialPagePayload` and explicit no-page intent. Raw primary plan/error
data is available to its `composeRequest` callback only. Its optional plan is
sanitized; opaque HTML hosts explicitly omit it from browser props and retain the
handoff. Common GSSP consumers need no manual serializer call.

App `request.loadExperience` retains the raw `NextjsServerRequestResult` for
server composition. Its bound request roots/presentations project automatically;
explicit hosts can use `serializeNextjsRequestResult(result, { metadataKeys? })`
when assembling their own browser boundary. Preparation, configuration, callback
and unexpected errors propagate; expected Delivery failures can coexist with a
usable plan/handoff and a browser-safe `contentError`.
Static/ISR uses the existing explicit fetch/renderer, serializers and public cache
validation; native `revalidate`, redirects and errors remain application-owned.

For Pages server results, export components from `binding.request` as above;
keep its root stable in `_app` and pass the same result to its presentation.
Alternatively use `NextjsPagesRouterRequestRoot` or
`NextjsPagesRouterRequestAnalyticsRoot` with `NextjsDefaultRequestRootProps` and
explicit browser configuration. Flat SDK options, `consent.clientDefaults` and
`cookie` can be bound once in a client module. Ordinary top-level components
remain available for explicit Web flows. Comparisons stay application-owned.

Both routers use `createNextjsRouteKey`: hash-only and Pages shallow changes do not
own a page, while committed path/query changes and back/forward do. Canceled
transitions create no new intent. Startup data is not readopted after leaving its
initial route; existing React/SDK reset handles the current visitor. Remove old
attributed DOM before Reset. Managed Live Preview replaces the browser owner on mode entry/exit and switches
sessions through its existing replacement API; ordinary navigation retains it.
The managed configuration requires deployment enablement plus a trimmed URL
session and supplies inactive `isPreview: false` internally. Browser preview
credentials are separately designated; server implementation loaders are never serialized.

## Public cache conveniences

`createExperiencesCacheKey` covers explicit space/environment, Experience ID/revision, locale, parameters and approved `selectionDimensions`. `createPublicPermutationCacheMetadata` adds `permutationKey`, optional `cacheVersion` and detached optional `tags`. The application owns dimension completeness and must exclude raw profile, identity and replay.

`createNextjsPublicPermutationCacheMiddleware({ resolveCache, rewrite?, cacheKeySearchParam? })` performs bounded routing only. Its default query name is `ctfl-exp-cache-key`. It preserves terminal responses, existing response headers/cookies and authoritative request-header removals, sanitizing SDK-owned request headers before rewriting. It imports no Node runtime and runs in Edge middleware. It neither initializes a visitor nor implements a cache.

When rewriting, it regenerates `x-ctfl-exp-request-url` from the actual normalized request URL, excluding `_rsc` and the hash. Chain it with the no-options `createNextjsExperiencesContextHandler()` in either order by passing the first middleware's response to the second. Both orders retain the original request URL rather than the cache rewrite target and discard caller-supplied SDK headers. Keep configured visitor binding off public/static routes, as described above.

Canonical handoff parsing retains valid public-permutation tags. Next boundaries additionally validate at most 128 nonempty tags, each at most 256 characters, without commas or line breaks. Pass `cache.tags` explicitly to supported Next fetch `next.tags` or framework invalidation APIs; the SDK does not install an invalidation service. Private content never enters this path.

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
