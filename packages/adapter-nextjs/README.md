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
| `/request-handler`     | `createExperiencesContextHandler` and its option/resolver types for context-only Node middleware.                                                                                                      |
| `/app-router/server`   | `bindAppRouterServerExperiences`, request-aware server components and explicit/static rendering.                                                                                                       |
| `/app-router/client`   | `bindAppRouterClientExperiences`, `AppRouterRequestRoot`, `AppRouterRequestAnalyticsRoot`, managed/injected content and server children.                                                               |
| `/pages-router/server` | `bindPagesRouterServerExperiences` and its native request/response helper.                                                                                                                             |
| `/pages-router`        | `bindPagesRouterExperiences`, Web components, request components and standalone request roots.                                                                                                         |
| `/cache-middleware`    | Edge-compatible `createPublicPermutationCacheMiddleware`; no Node SDK or event work.                                                                                                                   |
| `/package.json`        | Package metadata.                                                                                                                                                                                      |

## Automatic single-Experience setup

Bind the server registry and one `request.experience` once. The binder owns the
primary fetch, resolution and request lifetime; a request root and presentation
share its complete result. Repeated presentations can render its plan without
another fetch. Multiple-fetch ordering, identity and results remain
application-owned diagnostic behavior; there is no declarative multi-prefetch,
result list, identity reconciliation or additional cache/controller/barrier.

`request.experience` accepts exactly one selector: `{ experienceId }`,
`{ destinationId, path }`, or `{ destinationId, nodeId }`. Destination paths name
content lookup paths; route keys retain the browser pathname and query. For example:

```ts
request: {
  experience: ({ requestUrl }) => ({
    destinationId: process.env.CONTENTFUL_DESTINATION_ID!,
    path: new URL(requestUrl).pathname,
  }),
},
```

The fetched plan carries the actual `experienceId` from the selected payload.
Destination redirects remain `{ redirect: { path } }` on raw request results.
App server convenience roots and presentations invoke Next's native redirect
before rendering or browser adoption. Pages callers return a native GSSP redirect
before passing props. A terminal redirect does not replay its handoff or emit a
fallback page on the destination route. Browser managed components and hooks use
native router navigation by default; an explicit `onRedirect` overrides it.

### App Router

Export named components from `binding.request` in the binding modules, then import
and render those names in pages (`<ExperiencesRoot>` and `<Experience>`). Bind the
configuration once. The default server binding renders content on the server and uses
the built-in browser root:

```tsx
// lib/experience-server.tsx
import 'server-only';
import { bindAppRouterServerExperiences } from '@contentful/experiences-nextjs/app-router/server';
import { createPrivateFetch } from '@contentful/experiences-nextjs/server';
import { serverRegistry } from './server-registry';

export const binding = bindAppRouterServerExperiences({
  spaceId: process.env.CONTENTFUL_SPACE_ID!,
  environmentId: 'master',
  locale: 'en-US',
  delivery: {
    accessToken: process.env.CONTENTFUL_DELIVERY_TOKEN!,
    fetch: createPrivateFetch(),
  },
  config: serverRegistry,
  browser: {
    delivery: { accessToken: process.env.NEXT_PUBLIC_CONTENTFUL_DELIVERY_TOKEN! },
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
import { createExperiencesContextHandler } from '@contentful/experiences-nextjs/request-handler';

export const middleware = createExperiencesContextHandler();
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
   `Experience` uses `ServerExperienceRenderer` unless a client presentation is
   explicitly injected as described below. Use
   `request.ExperiencesAnalyticsRoot` for opaque server children with browser
   analytics; it retains the handoff while omitting the plan from browser props.
   Content and preview updates use server round-trips. Analytics-only browser
   owners still require Delivery configuration under the Runtime constructor contract.
2. **Server evaluation and browser-managed presentation:** inject the client
   request components into the server binding for automatic loading, serialization
   and result forwarding. Alternatively, call `request.loadExperience()` and pass
   the complete serialized result to the client request root. Its `Experience`
   inherits that result, or accepts an explicit `result` prop. The supplied plan
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

import { bindAppRouterClientExperiences } from '@contentful/experiences-nextjs/app-router/client';
import { browserRegistry } from './browser-registry';

const binding = bindAppRouterClientExperiences({
  config: browserRegistry,
  spaceId: process.env.NEXT_PUBLIC_CONTENTFUL_SPACE_ID!,
  environmentId: 'master',
  locale: 'en-US',
  delivery: { accessToken: process.env.NEXT_PUBLIC_CONTENTFUL_DELIVERY_TOKEN! },
});
export const { ExperiencesRoot, Experience } = binding.request;
```

For automatic forwarding, pass these client components to the server binder.
`serverOptions` contains the same server configuration shown above:

```tsx
// lib/experience-server.tsx — optional browser-managed presentation.
import 'server-only';
import { bindAppRouterServerExperiences } from '@contentful/experiences-nextjs/app-router/server';
import { serverOptions } from './server-config';
import { ExperiencesRoot as ClientRoot, Experience as ClientExperience } from './experience-client';

export const binding = bindAppRouterServerExperiences(serverOptions, {
  request: { ExperiencesRoot: ClientRoot, Experience: ClientExperience },
});
export const { ExperiencesRoot, Experience } = binding.request;
```

The page can now render `<ExperiencesRoot><Experience /></ExperiencesRoot>` using
these server exports. Both components share one server evaluation. The injected
`Experience` receives the complete projected result, including content failures;
the ordinary server-rendered path remains available by omitting the injection.
Configure renderer callbacks and DOM handlers in the client module; props passed
through the server convenience component, including metadata, must be serializable.
Navigation continues to use fresh server results; this option does not transfer
loading or navigation to Web.

For manual composition, the raw loader and explicit projection remain available:

```tsx
// app/page.tsx — alternative to the default server-rendered composition above.
import { serializeRequestResult } from '@contentful/experiences-nextjs/app-router/server';
import { binding } from '../lib/experience-server';
import { ExperiencesRoot, Experience } from '../lib/experience-client';

export default async function Page() {
  const result = serializeRequestResult(await binding.request.loadExperience());
  return (
    <ExperiencesRoot result={result}>
      <Experience result={result} />
    </ExperiencesRoot>
  );
}
```

### Pages Router

Bind the same server policy once with `bindPagesRouterServerExperiences`
from `/pages-router/server`; supply an explicit trusted `origin` for host-independent
page URLs. Bind the browser registry and flat browser SDK options in a client
configuration module, then export the named components once. Import
`ExperiencesRoot` into `_app` and `Experience` into the page. Keep private server
configuration and imports inside the GSSP server dependency path.

```tsx
// lib/pages-experience-server.tsx — consumed only by getServerSideProps.
import { bindPagesRouterServerExperiences } from '@contentful/experiences-nextjs/pages-router/server';
import { createPrivateFetch } from '@contentful/experiences-nextjs/server';
import { serverRegistry } from './server-registry';

export const pagesExperiences = bindPagesRouterServerExperiences({
  spaceId: process.env.CONTENTFUL_SPACE_ID!,
  environmentId: 'master',
  locale: 'en-US',
  origin: process.env.APP_ORIGIN!,
  delivery: {
    accessToken: process.env.CONTENTFUL_DELIVERY_TOKEN!,
    fetch: createPrivateFetch(),
  },
  config: serverRegistry,
  consent: { server: false }, // Supply the application's request consent policy.
  request: { experience: { experienceId: 'home' } },
});
```

```tsx
// lib/pages-experience-client.tsx
'use client';

import { bindPagesRouterExperiences } from '@contentful/experiences-nextjs/pages-router';
import { browserRegistry } from './browser-registry';

const binding = bindPagesRouterExperiences({
  config: browserRegistry,
  spaceId: process.env.NEXT_PUBLIC_CONTENTFUL_SPACE_ID!,
  environmentId: 'master',
  locale: 'en-US',
  delivery: { accessToken: process.env.NEXT_PUBLIC_CONTENTFUL_DELIVERY_TOKEN! },
  consent: { clientDefaults: { consent: false, persistenceConsent: false } },
  cookie: { path: '/', sameSite: 'lax' },
});
export const { ExperiencesRoot, ExperiencesAnalyticsRoot, Experience } = binding.request;
```

```tsx
// pages/index.tsx
import type { GetServerSideProps } from 'next';
import type { RequestResult } from '@contentful/experiences-nextjs/pages-router/server';
import { pagesExperiences } from '../lib/pages-experience-server';
import { Experience } from '../lib/pages-experience-client';

export const getServerSideProps: GetServerSideProps<{ result: RequestResult }> = async (
  context
) => {
  const result = await pagesExperiences.request.loadExperience(context);
  if (result.redirect) return { redirect: { destination: result.redirect.path, permanent: false } };
  return { props: { result } };
};

export default function Page() {
  return <Experience />;
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

App hosts project raw results with `serializeRequestResult`; Pages GSSP
returns JSON-safe results directly. Pass each complete result, including its
`requestId`, to the client request root. Its request `Experience` inherits the
nearest request root's result; an explicit `result={result}` takes precedence for manual
composition. An empty request root keeps inherited presentation inactive until
a result arrives. Omitting both the root and an explicit result throws a
configuration error, including under an ordinary Web root with Live Preview configured.
Preserve complete results without overlays.
Private configuration, raw errors and unapproved metadata remain server-local.

App server roots and injected presentations share render-local memoization of both
the primary evaluation and its sanitized browser result. Place roots that need fresh
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

## Managed Contentful Live Preview

Install the optional `@contentful/experiences-live-preview` package and configure
one Preview context in the existing `preview` object. Keep private server credentials
and explicitly browser-visible credentials separate:

```tsx
// lib/experience-client.tsx
'use client';
import { createLivePreviewClient } from '@contentful/experiences-live-preview';
import { bindAppRouterClientExperiences } from '@contentful/experiences-nextjs/app-router/client';
import { browserRegistry } from './browser-registry';

const binding = bindAppRouterClientExperiences({
  config: browserRegistry,
  preview: {
    accessToken: process.env.NEXT_PUBLIC_CONTENTFUL_PREVIEW_TOKEN!,
    createClient: createLivePreviewClient,
  },
});
export const { ExperiencesRoot, Experience } = binding.request;
```

Configure the server binder’s separate `preview` object with its private
`accessToken` (including a token supplier) or an explicit trusted proxy `host`.
Supplied server Preview configuration must contain one of those transport options;
otherwise the binder throws during construction, before cookie or event work.
Server snapshots use that normal
Preview transport; the browser’s synchronous package factory stays in the client
module. Continue using the server load/serialization and injected client root shown
above. Client callbacks are never copied from the server. For Pages, supply the same context options to the server binder and
`bindPagesRouterExperiences`, retaining the existing GSSP and `_app` composition.

Preview activates only when configuration is present and the current URL contains
a trimmed, nonempty `preview_session_id`. Browser owners read the current browser URL;
server loaders read the incoming request URL. Removing the parameter returns to ordinary
mode. The readonly `sdk.isPreview` reports this derived mode.

Experience JSX and complete request results stay unchanged:

```tsx
<binding.request.ExperiencesRoot result={result}>
  <binding.request.Experience />
</binding.request.ExperiencesRoot>
```

The session contains one current Experience. Its raw payload's `sys.id` controls
which ordinary ID receives its content. After a successful snapshot lookup,
unrelated IDs retain their normal by-ID source; missing identity is never broadcast
or guessed from child order. See Runtime's [acquisition limits](../runtime/README.md#optional-runtime-live-preview)
for failures before identity is known and the absence of published-content fallback.
Repeated matching views keep their own resolution options. There are no renderer
session props, target IDs, replacement APIs or per-Experience session records.

Changing sessions creates a new owned SDK context below the existing history guard;
consumers need no Preview-specific key or wrapper. Both server families project only
credential/client-free `preview` context metadata through the result. Browser setup
retains its separately configured token and loader. Server-only presentations observe
`states.preview` revisions through `usePreviewState()` and refresh when a valid
payload arrives, without browser resolution. Browser-managed presentations use their
existing resolved update subscription. Initial server plans and complete-result
history guards remain in force. Injected SDK lifetime stays application-owned.

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

`configureServerExperiences(config)` accepts the Node SDK's `Config` from
`@contentful/experiences-node` and returns the actual Node SDK with stable configuration. It does not force private fetch options, read request state, submit events, or load content. `bindExperiencesRequest(sdk, options)` calls `forRequest()` once and returns the actual `RequestRuntime` directly, with its normal fetch, resolve, destination, event and `destroy()` methods.

```ts
import {
  configureServerExperiences,
  bindExperiencesRequest,
  createPrivateFetch,
  applyPrivateResponseCache,
  persistAnonymousId,
} from '@contentful/experiences-nextjs/server';

const sdk = configureServerExperiences({
  spaceId: process.env.CONTENTFUL_SPACE_ID!,
  environmentId: 'master',
  delivery: {
    accessToken: process.env.CONTENTFUL_DELIVERY_TOKEN!,
    fetch: createPrivateFetch(),
  },
});

// The host supplies these values from its supported request boundary.
const request = bindExperiencesRequest(sdk, {
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
  applyPrivateResponseCache(response);
  persistAnonymousId(response, request);
  // Render plan independently of event delivery or profile finalization.
} finally {
  request.destroy();
}
```

`consent` is required and independent of any cookie. Cookie identity is read only when persistence consent is explicitly granted (`true` or `{ persistence: true }`). An explicitly supplied `profile` takes precedence and can remain volatile without persistence consent. An explicit `cookies` reader takes precedence over effective `headers`, then request cookies/header. Empty supplied cookies or headers are authoritative and cannot restore an identity removed by the host. A configured Preview transport and a nonempty request-local session exclude every visitor profile input and never read identity cookies. Next derives request-local session context from the incoming URL; optional Preview remains lazy and SDK-owned.

Node request context options such as `resolveOptions`, `personalizationOptions` and `analyticsOptions` are accepted; session selection is owned by Next. The helpers infer no IP from `Forwarded` or `X-Forwarded-For`; trusted IP policy belongs in `personalizationOptions.ip`. Explicit headers are authoritative. Page context precedence is the request URL (or the forwarded URL when no request is supplied), then `eventContext.page`, then explicit `page`. Path-style `page` input inherits an omitted referrer and URL origin from the merged lower-precedence context; its explicit path/search and URL/origin/referrer options take precedence, including an empty referrer. Explicit `locale` overrides event-context locale; explicit event-context `userAgent` overrides the header.

`createPageContext({ path, origin?, url?, searchParams?, referrer? })` accepts `URLSearchParams` or Next search-param records containing strings/arrays. The supplied `path` determines `page.path`; `searchParams` determines `page.search` and `page.query`, preserving ordered duplicate values in `search` and `query`. A query key with one value maps to a string; repeated keys map to ordered string arrays. Explicit `url` overrides only `page.url` and is returned unchanged, including its encoding and hash. Without `url`, the helper builds it from path/search and optional origin. `createRouteKey(url)` separately removes `_rsc` and the hash and canonicalizes spaces so `%20` and `+` match. The host retains its base-path, locale-prefix and trailing-slash policy. `createEventContext(options)` parses the actual request or supplied forwarded URL into derived pathname/search/query and returns the parsed URL's `toString()` in `page.url`, without framework reads or transport filtering. Derived search retains its original encoding and `_rsc`, and the derived URL retains its hash; Next transport normalization belongs to route keys and the sanitized middleware forwarding boundary. These helpers omit derived page title; explicit caller context remains caller-owned.

`createEventContext(options: CreateEventContextOptions)` returns `UniversalEventBuilderArgs` for the Node request's `eventContext` field. When using Node's `forRequest()` directly, nest the result under that field:

```ts
import { createEventContext } from '@contentful/experiences-nextjs/server';

const request = sdk.forRequest({
  consent: visitorConsent,
  eventContext: createEventContext({ request: incomingRequest }),
});
```

`bindExperiencesRequest()` performs this composition automatically.

## Response cookies and private caching

`applyPrivateResponseCache(response)` applies `Cache-Control: private, no-store`; `persistAnonymousId(response, request, options?)` appends identity `Set-Cookie` using the request's current profile. Binding has no response persistence closure and accepts no `cookieOptions` or `deleteWhenProfileCannotPersist`; `anonymousIdCookieName` on binding controls identity lookup only. Supply response cookie options to the standalone helper or context middleware. For `NextResponse`, it uses the cookie jar so later application `cookies.set()` calls retain SDK identity and withdrawal also updates middleware cookie forwarding. Plain responses use the header fallback. It preserves other cookies, `Vary` and other headers. Call it only where headers are writable: a Route Handler, Server Action response or middleware response, never during Server Component rendering. A cookie or provisional XDA ID is not proof of committed profile state.

Next's response cookie jar is keyed by name. The helper restores raw `Set-Cookie` headers at other domain/path scopes, including expiration headers, but later application jar writes can discard those raw headers again. Finish jar writes before appending raw multi-scope headers and calling this helper.

The standalone `createAnonymousIdSetCookieHeader(request, options?)` and `persistAnonymousId(response, request, options?)` expose the cookie decision without changing cache headers. Options are `anonymousIdCookieName`, `cookieOptions` (`path`, `domain`, `sameSite`, `secure`, `httpOnly`, `expires`, `maxAge`) and `deleteWhenProfileCannotPersist`. The latter defaults to `true`, following Optimization; set it to `false` when the host does not own withdrawal deletion at this boundary. Deletion uses the same configured path/domain. Defaults are `ctfl-opt-aid`, path `/`, and `SameSite=Lax`. Standalone cookie helpers retain configurable `httpOnly` for server-scoped identity. Preview never writes or expires identity. No profile means no new cookie.

`createPrivateFetch(customFetch?)` preserves the custom fetch implementation, input, authorization, method, body, headers and abort signal while overriding cache with `no-store`. It removes positive or indefinite (`false`) Next `revalidate` conflicts and preserves other Next options. Install it only in host-assembled private `delivery.fetch` and, when needed, Preview Session `preview.fetch` configuration. `applyPrivateResponseCache(response)` sets private/no-store headers without replacing `Vary`. Session snapshots use that configured Preview transport too; run session work outside cached functions on a dynamic no-store route.

## Browser serialization

`serializePlan(plan, { metadataKeys? })` returns a detached browser plan. It sets `diagnostics: []`, omits `deliveryDiagnostics` and personalization, and defaults `metadata` to `{}`. Explicit `metadataKeys` allow only selected metadata fields. Nodes, slots, attribution and source maps remain intact. Known absent SDK structural optional fields are projected explicitly; customer content/design/resolved records and approved metadata remain strict JSON data. Server diagnostics remain available on the original plan.

`serializeHandoff(handoff, { spaceId, environmentId })` delegates scope, cache and envelope validation to Node's canonical parser. Use the actual Node producer's complete result even when it contains an error and no plan. The serializer retains profile ID, evaluated message IDs, event order/bodies, route key and replay locale; complete profile state is preserved for the request-scoped browser handoff. It explicitly omits absent SDK context optionals emitted by builders, including nested page context fields, page-event properties, campaign and location optionals, while preserving all defined fields and raw query arrays. Customer event properties and traits remain strict JSON data. It creates no new wire DTO or events and is not an untrusted replay admission API; producer and browser owners retain their batch/schema/count/lifetime checks. Handoff bodies are browser-visible: do not include secrets, cache, log or persist them.

All transferred application data must be JSON-safe. Functions, symbols, bigint, cycles, non-finite numbers, unsupported class instances and arbitrary `undefined` fields throw path-specific `TypeError`s. `serializeJsonForHtml(value)` performs strict validation and escapes `<`, U+2028 and U+2029 for a JSON script body. Ordinary React markup uses normal React escaping.

## Explicit public and static use

Stable configuration remains usable for static/ISR/public rendering without request reads or a private fetch wrapper. Call `assertPublicRequestPolicy({ cache, context?, fetchOptions? })` with the exact context and fetch options that the host will use. Policy must be explicit: `{ scope: 'static' }` or `{ scope: 'public-permutation', key }`. Public permutation keys must be nonempty and application-complete: include content identity/revision, space/environment, locale, parameters and every selection dimension. The validator cannot prove key completeness; the application owns it and actual cache configuration.

Public/static requests exclude profile/identity, personalization events, replay and preview. The validator rejects private request inputs; canonical handoff validation rejects any identity/state/replay in public/static handoffs. Do not bind an incoming visitor request or apply private response caching/cookie persistence on the public/static path. Use explicit `sdk.forRequest({ consent: false, locale })` or the existing free fetch function after validating policy. A supplied plan and cache metadata do not themselves configure Next's Data Cache or response caching. There is no additional SDK cache framework.

## Context-only middleware and request reuse

Import `createExperiencesContextHandler` from `/request-handler`. With no options it sanitizes and forwards context only. With `{ sdk, consent, ...requestOptions }`, `consent` may be a value or resolver receiving `{ request, headers, cookies }`. Preview session identity is derived automatically from the incoming request URL and the configured SDK Preview transport. Explicit `bindExperiencesRequest` uses the request URL, or the forwarded URL header when no request is supplied. Consent resolver failure aborts binding and cookie work.

The handler follows Optimization's pinned Next request-header override mechanics. It honors effective overrides and removed cookies, strips incoming `x-ctfl-exp-*` headers, and sets `x-ctfl-exp-request-url` from the actual normalized request URL. It preserves existing rewrites, response headers/cookies and terminal redirect/error/body responses. Terminal responses skip resolvers and binding. Handler options separately accept the standalone cookie persistence options. At persistence, middleware forces `cookieOptions.httpOnly: false` for shared browser identity, including withdrawal, even when the input sets it to `true`. Configured context binding applies private response caching, persists only the identity already available and destroys its direct local request in `finally`; middleware does not fetch content, submit page/identify events, prepare replay or make commits a prerequisite. The `/request-handler` entry uses Node; it is not an Edge binder. Only trust forwarded URL context from a boundary that runs this sanitization.

Scope a configured handler to personalized document routes. Applying it to static assets, public pages or unrelated API routes also applies private/no-store caching and cookie persistence there. Exclude those routes with the host's middleware matcher; the handler does not infer document routes. For example:

```ts
// middleware.ts — extend only to document routes that need visitor binding.
export const config = { runtime: 'nodejs', matcher: ['/', '/page-two'] };
```

The App Router request family owns routine memoization. Explicit hosts may still use a stable React `cache` callback to share one actual descriptor load promise and its complete Node result across presentation/root, including failures:

```ts
import { cache } from 'react';
import { bindExperiencesRequest, createRouteKey } from '@contentful/experiences-nextjs/server';

const loadExperience = cache(async () => {
  const request = bindExperiencesRequest(sdk, explicitRequestOptions);
  try {
    return await request.fetchExperienceForHandoff(
      actualDescriptor,
      { config: experienceConfig },
      { routeKey: createRouteKey(explicitRequestUrl) }
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
`bindAppRouterServerExperiences` and `bindAppRouterClientExperiences`
families. Bind the server Node configuration and render registry once; configure
the browser registry and callbacks in a client module. `consent.server` resolves
independent request consent, while `consent.clientDefaults` configures Web defaults.

For RSC node rendering, server-only components use ordinary attribute forwarding.
Named root bindings (`root: { prop: 'experienceRoot' }`) require a component
exported from a `'use client'` module, or a client-bound `createExperienceNode`
receiving serializable snapshots. Slot JSX can cross this boundary; server-created
handlers and DOM refs cannot. See [React root bindings](../adapter-react/README.md#attributed-rendering-and-dom-roots).

Set `request.mode` to `'ssr'` for an ordinary server fetch that requests XDA
commitment, or `'hybrid'` (the default) to preview the server batch and commit it
through browser replay. The type is `ServerValue<'ssr' | 'hybrid'>`, so mode can
resolve from the server request context; Pages also accepts per-load overrides.
For example, `request: { mode: 'ssr', experience: { experienceId: 'home' } }`
selects SSR page ownership. This setting is independent of editor Preview Sessions and CPA; no browser mode is required.

The App server `request` family memoizes one primary Experience result for
`loadExperience`, `Experience`, `ExperiencesRoot` and `ExperiencesAnalyticsRoot`.
Request roots and presentations receive one JSON-safe `result: RequestResult`:
`requestId`, `routeKey`, event-free `experience`, optional `plan`, `redirect`, `handoff`,
`contentError` string, `initialPagePayload`, optional `initialPageOwner: 'server'`
and optional credential/client-free `preview` context metadata. `requestId` distinguishes fresh results;
request presentations accept no descriptor or seed overlays. App's `request.loadExperience` also
retains the selected server-local `experienceId` when available and raw `error`; browser projection excludes
those fields and sanitizes the optional plan. Analytics roots omit that plan for
opaque server children while preserving the handoff.
Only the App opt-in path reads `headers()`/`cookies()`; configure the sanitized request
handler first. `request.mode`, `request.experience`, `initialEvents`, `pagePayload` and `resolveOptions`
can be request-context resolvers. `ServerRequestPolicy` binds one primary request.
Document, RSC and Pages data requests evaluate the primary Experience on Node using
ordinary fetch in SSR mode or the transfer producer in hybrid mode. The latter
fixes `preflight: true` and rejects explicit per-call `false`; ordinary supplied
personalization defaults to the request facade's mode-derived value (`false`
in SSR and `true` in hybrid); explicit `personalization.preflight` overrides
that default. Editor preview uses ordinary fetch and
suppresses events. Requests marked
as speculative (`next-router-prefetch`, `purpose` or `sec-purpose`) perform no primary
fetch or composition, and their request `Experience` renders nothing even when a
client presentation is injected. Next.js can also issue full prefetches without those markers;
these follow the ordinary RSC path. Configure prefetching at the application boundary
when server evaluation must wait for navigation. Each actual non-preview server
load, document, RSC or Pages data, resolves `request.initialEvents` and `request.pagePayload`
and appends the automatic page event for XDA evaluation, with server commitment in
SSR mode or browser replay in hybrid mode.
Explicit `personalization.events` remains authoritative caller intent, including
`events: []` to suppress automatic page intent. The resolved `request.pagePayload`
also travels as `initialPagePayload` for browser fallback.
Actual non-editor-preview SSR primary attempts set `initialPageOwner: 'server'`.
For the matching `requestId` and route, browser roots hydrate the existing private
profile/changes/identity state without replay and suppress initial page emission
and fallback. The marker records ownership, not proof of event admission or
commitment: suppression also applies when consent dropped the server event or
the server outcome is ambiguous. Later browser consent grant does not compensate
for that SSR page. Hybrid/CSR consent retry stays unchanged when the marker is
absent, and fresh browser navigation resumes ordinary page behavior.
Each fresh server preparation can emit a page event, including a same-route
`router.refresh()`. Adopting the same exact hybrid result or prepared message IDs replays
only once; a fresh preparation has fresh event identity. Ordinary Web SDK retry and
refresh continue to use event-free fetches.
High-level `cookie: CookieConfig` matches Web's shared identity
attributes (`path`, `domain`, `sameSite`, `secure`, and `expires` in days); the
request/response adapter converts expiry to response cookie options. It uses the
shared `ctfl-opt-aid` identity name. Low-level standalone helpers retain their
explicit cookie-name and response options. Optional `request.composeRequest(request, primary, context)`
receives the same facade and raw primary plan/error/handoff after every actual
server primary fetch, including RSC and Pages data, before browser projection and cleanup. It does
not run for requests marked speculative. Diagnostic comparison ordering, identity changes, result handling and per-ID error
isolation remain application-owned. The callback is an escape hatch, not a
declarative prefetch/result list or SDK multi-Experience mechanism.
Additional ordinary fetches through this facade inherit its mode-derived
`preflight` default, and their events are not automatically included in the
primary browser replay. Set `personalization.preflight: false` explicitly when
an additional fetch's consent-admitted events should commit.
Callback exceptions propagate; cleanup still runs. Server rendering retains raw metadata.

Explicit no-page intent uses the existing `personalization.events: []` input.
It is retained in `result.experience.personalization.events: []`, and automatic
roots respect it for the matching result instead of synthesizing page intent.
No separate flag or payload overlay is needed. Explicit events are complete
caller intent; do not combine them with `request.initialEvents` or `request.pagePayload`.

The explicit server `Experience` accepts a supplied plan or a public/static
Experience or destination selector with explicit cache policy; it reads no framework context.
Destination redirects use native Next navigation before rendering. Existing
explicit Node host helpers remain available for custom request boundaries.
Server functions and credentials stay outside client props.
The server request `Experience` defaults to `ServerExperienceRenderer`. The optional
second argument's `request.Experience` selects browser-managed presentation and
automatically forwards the serialized result. Root overrides remain available.
Browser renderer callbacks, DOM event handlers and custom container components
belong in the client binding. Server-rendered `Experience` components retain server
renderer callbacks; the injected request path excludes them. Custom root overrides own their preview refresh observer;
use the client binding's `request.ExperiencesAnalyticsRoot` when that root wraps
server-rendered content. Built-in server roots install their own matching observer
for server rendering and omit it when a client presentation is injected. Analytics
roots retain their server refresh behavior.

Both client bindings expose ordinary `ExperiencesRoot`, `ExperiencesAnalyticsRoot`
and managed `Experience` for Web-owned flows, plus `ExperienceRenderer` and
`useManagedExperience`. Their separate `request` family exposes roots and an
`Experience` accepting or inheriting the complete server `result`; top-level `Experience` has
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
`bindPagesRouterServerExperiences(config).request.loadExperience(ctx, overrides?)`.
Call it from native `getServerSideProps` after application redirect/error decisions.
Bind `config`, `request.experience`, `request.resolveOptions`,
`consent.server`, `consent.clientDefaults` and `cookie` once; per-call
`PagesRouterRequestOptions` provides explicit overrides. A trusted `origin`
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

Pages `request.loadExperience` returns the JSON-safe `RequestResult` directly,
including `initialPagePayload` and explicit no-page intent. Raw primary plan/error
data is available to its `composeRequest` callback only. Its optional plan is
sanitized; opaque HTML hosts explicitly omit it from browser props and retain the
handoff. Common GSSP consumers need no manual serializer call.

App `request.loadExperience` retains the raw `ServerRequestResult` for
server composition. Its bound request roots/presentations project automatically;
explicit hosts can use `serializeRequestResult(result, { metadataKeys? })`
when assembling their own browser boundary. Preparation, configuration, callback
and unexpected errors propagate; expected Delivery failures can coexist with a
usable plan/handoff and a browser-safe `contentError`.

Both bindings infer each loader result from its selected Experience, including async
selectors and per-call overrides. By-ID selections retain definite server result IDs;
Destination or mixed selections retain optional IDs. `composeRequest` receives the
general result because the same callback runs for any selected override.

Static/ISR uses the existing explicit fetch/renderer, serializers and public cache
validation; native `revalidate`, redirects and errors remain application-owned.

For Pages server results, export components from `binding.request` as above;
keep its root stable in `_app` and pass the same result to its presentation.
Alternatively use `PagesRouterRequestRoot` or
`PagesRouterRequestAnalyticsRoot` with `DefaultRequestRootProps` and
explicit browser configuration. Flat SDK options, `consent.clientDefaults` and
`cookie` can be bound once in a client module. Ordinary top-level components
remain available for explicit Web flows. Comparisons stay application-owned.

Both routers use `createRouteKey`: hash-only and Pages shallow changes do not
own a page, while committed path/query changes and back/forward do. Canceled
transitions create no new intent. Startup data is not readopted after leaving its
initial route; existing React/SDK reset handles the current visitor. Remove old
attributed DOM before Reset. Managed Live Preview replaces the browser owner on mode entry/exit and switches
sessions by creating a new SDK context; ordinary navigation retains it.
A configured Preview transport and a trimmed URL session activate Preview; without
both, the root uses ordinary mode. Browser preview
credentials are separately designated; client instances and factories are never serialized.

## Public cache conveniences

`createCacheKey` covers explicit space/environment, exactly one Experience or destination selector, content revision, locale, by-ID parameters and approved `selectionDimensions`. Destination keys distinguish path and node selectors and include the destination ID. Existing by-ID key encoding is preserved. `createPublicPermutationCacheMetadata` adds `permutationKey`, optional `cacheVersion` and detached optional `tags`. The application owns dimension completeness and must exclude raw profile, identity and replay.

`createPublicPermutationCacheMiddleware({ resolveCache, rewrite?, cacheKeySearchParam? })` performs bounded routing only. Its default query name is `ctfl-exp-cache-key`. It preserves terminal responses, existing response headers/cookies and authoritative request-header removals, sanitizing SDK-owned request headers before rewriting. It imports no Node runtime and runs in Edge middleware. It neither initializes a visitor nor implements a cache.

When rewriting, it regenerates `x-ctfl-exp-request-url` from the actual normalized request URL, excluding `_rsc` and the hash. Chain it with the no-options `createExperiencesContextHandler()` in either order by passing the first middleware's response to the second. Both orders retain the original request URL rather than the cache rewrite target and discard caller-supplied SDK headers. Keep configured visitor binding off public/static routes, as described above.

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
