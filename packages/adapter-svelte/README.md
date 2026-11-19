# @contentful/experiences-svelte

> ⚠️ **Alpha.** Published to npm. APIs are unstable and will change.

The Svelte adapter for the Contentful Experiences SDK. You bring your own Svelte 5 components; it renders Experience payloads from the Experience Delivery API (XDA) with them.

```sh
npm install @contentful/experiences-svelte
```

This is the only rendering SDK package you install. It re-exports everything you need from `@contentful/experiences-sdk-core`, `@contentful/experiences-design`, and `@contentful/experiences-client`. The optional `@contentful/experiences-live-preview` package is also customer-facing and provides the framework-neutral live-preview client.

Authoring and supplied-plan rendering share the React adapter's registry and
design model. Svelte uses `Component`s, named `Snippet[]` slots and
`getDesignValues()`.

For SvelteKit, start with [Managed SvelteKit integration](#managed-sveltekit-integration).
For Vite or an embedded browser host, use the [portable binding](#managed-browser-integration).
For existing Preview and consent integrations, see [Migration](#migration).

---

## Compatibility

The adapter supports Svelte `^5.55.7`. The optional Kit peer
`^2.70.4 || ^3.2.0` applies to `/kit/client` and `/kit/server`. Portable
root imports and their declarations are Kit-free.

| Locally tested workflow            | Svelte | SvelteKit          | TypeScript | Vite  |
| ---------------------------------- | ------ | ------------------ | ---------- | ----- |
| Customer SvelteKit example         | 5.57.3 | 2.70.4             | 5.9.3      | 6.4.6 |
| Packed SvelteKit reference on Node | 5.57.3 | 3.2.0              | 6.0.3      | 8.3.8 |
| Standalone Vite example            | 5.57.3 | No Kit integration | 5.9.3      | 6.4.6 |
| Astro 7.4.12 Svelte island on Node | 5.57.3 | No Kit integration | 5.9.3      | 8.3.8 |

The Kit 3 reference uses its own application toolchain. The published adapter
does not require TypeScript 6 or Vite 8 for portable Svelte or Kit 2. Use a
supported Node host for the managed Kit server recipe. For a static deployment,
use the portable browser workflow or server-generated public supplied plans.

## Public API

### Managed SvelteKit integration

`bindSvelteKitClientExperiences` from `/kit/client` binds the universal loader,
the managed presentation and its browser SDK owner. Bind the shared registry
once in a browser-safe module. The Kit binding requires a matching
[server preparation endpoint](#kit-server-preparation).

```ts
// src/lib/experiences.ts
import { bindSvelteKitClientExperiences } from '@contentful/experiences-svelte/kit/client';
import { PUBLIC_CONTENTFUL_DELIVERY_TOKEN } from '$env/static/public';
import { experienceConfig } from './experience-config';

export const { request } = bindSvelteKitClientExperiences({
  config: experienceConfig,
  endpoint: '/_exo/primary',
  spaceId: 'your-space',
  environmentId: 'master',
  delivery: { accessToken: PUBLIC_CONTENTFUL_DELIVERY_TOKEN },
});
```

In your universal route, pass the complete selector to `request.loadExperience`
and return its source intact. Pass the committed source to one stable layout root
and render the bound `Experience` on the route.

```ts
// src/routes/[...path]/+page.ts
import { request } from '$lib/experiences';
import type { PageLoad } from './$types';

export const prerender = false;
export const load: PageLoad = async (event) => ({
  primarySource: await request.loadExperience(event, {
    experience: { destinationId: 'your-destination', path: event.url.pathname },
  }),
});
```

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { page } from '$app/state';
  import { request } from '$lib/experiences';

  const { ExperiencesRoot } = request;
  let { children } = $props();
</script>

<ExperiencesRoot source={page.data.primarySource}>
  {@render children()}
</ExperiencesRoot>
```

```svelte
<!-- src/routes/[...path]/+page.svelte -->
<script lang="ts">
  import { request } from '$lib/experiences';

  const { Experience } = request;
  const current = request.useManagedExperience();
</script>

{#snippet baseline()}
  <p>This content is currently unavailable.</p>
{/snippet}

{#if current.result?.notFound}
  <h1>Page not found</h1>
  <a href="/">Return to the storefront</a>
{:else}
  {#if current.error}
    <button type="button" onclick={() => current.retry()}>Retry content</button>
  {/if}
  <Experience loadingFallback={baseline} errorFallback={baseline} />
{/if}
```

Kit reuses the captured result during hydration. Enhanced navigation can prepare
content in advance, and the root adopts only the source that reaches committed
loader data. Preloading alone gives no authority to adopt visitor state, replay
events or navigate to a Destination redirect. Pass the source through
unchanged. The complete `current.result` still describes the latest operation
if `current.data` retains an older applicable plan after a failure. Keep their
provenance separate.

Kit's universal loader registers `exo:primary` as a dependency. Use Kit's native
`invalidate('exo:primary')` to rerun that loader. Revalidation of the same URL
and unchanged selector, including parameters and locale, is an event-free
read. Managed `current.retry()` and `current.refresh()` read the active source
directly. After an explicit browser acquisition, they read through Web. These
reads preserve existing page and replay history.

The Kit root and provider also accept the portable `buildPagePayload` callback
for ordinary browser acquisition under that root. Get `current` with
`request.useManagedExperience()` during component initialization, then call
`current.acquire({ personalization })` from the browser action. A portable selecting
`Experience` can also run under the same Kit root. Explicit event lists,
including an empty list, take precedence over the callback. Kit-prepared
operations follow the page ownership and payload in their complete request result.

Use explicit browser-scoped credentials or an authenticated proxy. For the
server-backed `ssr = false` composition, export the chosen binding's
`request.init` from `hooks.client.ts` so the first load can use its browser owner.
Choose an injected SDK in browser-only startup code before init if the
application owns the SDK. With the owned binding, use:

```ts
// src/hooks.client.ts
import { request } from '$lib/experiences';
export const init = request.init;
```

For an injected binding, add `@contentful/experiences-web` to the app's
dependencies and choose the SDK before calling that binding's init:

```ts
// Browser-only startup, before mounting the client root.
import { ContentfulExperiences } from '@contentful/experiences-web';
import { bindSvelteKitClientExperiences } from '@contentful/experiences-svelte/kit/client';
import { experienceConfig } from './experience-config';

const sdk = new ContentfulExperiences({
  spaceId: 'your-space',
  environmentId: 'master',
  delivery: { accessToken: 'browser-scoped-token' },
});
const { request } = bindSvelteKitClientExperiences({
  config: experienceConfig,
  endpoint: '/_exo/primary',
  sdk,
});
await request.init();
const { ExperiencesRoot } = request;
// Mount this bound root; the application calls sdk.destroy() at its lifetime end.
```

Init and the bound root reuse the chosen instance. Ownership mode stays fixed
for that activation, and the application destroys an injected SDK. Web browser
state uses shared module signals. A fresh owned activation can start after
complete teardown. The Kit client hook applies to the full application. Use
early init when all server-backed routes have `ssr = false`. Applications with
SSR or hybrid routes can also use direct Web CSR. Their layout root activates
the browser SDK after the captured fetch on server-rendered documents.

### Choose the rendering mode

| Mode                                     | Initial content                                                        | Initial page and state                                                                                                                                            |
| ---------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SSR                                      | Native universal loader with a server binding in `ssr` mode            | The server owns the initial page attempt. Browser adoption of the matching result hydrates applicable state without replay or a second initial page.              |
| Hybrid                                   | Same loader with the server binding in `hybrid` mode                   | The server prepares a private state and optional event transfer. Web admits a matching handoff after commitment. Server preparation runs with `preflight: true`.  |
| Server-backed CSR                        | `ssr = false`, universal loader, and `request.init` in the client hook | The browser prepares content through the noncommitting endpoint and adopts the committed result.                                                                  |
| Direct Web CSR                           | Portable selecting `Experience` inside the Kit or portable root        | The browser fetches directly with Web policy. In a Kit route using `ssr = false` and no server-backed source, use a metadata-only loader and omit `request.init`. |
| Public static or supplied-plan rendering | Fetch public content separately or pass a supplied plan to a renderer  | A supplied-plan renderer works without an SDK owner or any setup for fetching, page events or Preview.                                                            |

On hybrid/browser adoption, a handoff must match the committed route and its
prepared state must remain eligible for Web admission. Keep the complete source
through loader data. Repeated presentations reuse the selected plan and the
stable request boundary keeps adoption history across Preview owner changes.

### Kit server preparation

`bindSvelteKitServerExperiences` from `/kit/server` binds native `handleFetch`
and `handlePreparation` handlers. Keep this binding in an application server-only
module. The Kit entries support the optional `@sveltejs/kit` peer range
`^2.70.4 || ^3.2.0`. Portable root imports work without Kit or Node. The
server entry is blocked from client bundles and rejects visitor preparation
while Kit is building or prerendering.

```ts
// src/lib/server/experiences.ts
import { bindSvelteKitServerExperiences } from '@contentful/experiences-svelte/kit/server';
import { CONTENTFUL_DELIVERY_TOKEN } from '$env/static/private';
import { experienceConfig } from '../experience-config';

export const { request } = bindSvelteKitServerExperiences({
  config: experienceConfig,
  endpoint: '/_exo/primary',
  spaceId: 'your-space',
  environmentId: 'master',
  delivery: { accessToken: CONTENTFUL_DELIVERY_TOKEN },
  consent: {
    server: (event) => ({
      events: event.cookies.get('site-events-consent') === 'accepted',
      persistence: event.cookies.get('site-persistence-consent') === 'accepted',
    }),
  },
  request: {
    mode: 'ssr', // 'hybrid' prepares an actual browser replay instead.
    authorizeExperience: (_event, experience, { url, resolveOptions }) =>
      resolveOptions === undefined &&
      'destinationId' in experience &&
      experience.destinationId === 'your-destination' &&
      'path' in experience &&
      experience.path === url.pathname &&
      !('parameters' in experience) &&
      !('extensions' in experience) &&
      (experience.personalization === undefined ||
        (experience.personalization.events?.length === 0 &&
          Object.keys(experience.personalization).every((key) => key === 'events'))),
    pagePayload: (_event, { url }) => ({
      properties: { title: 'Storefront', path: url.pathname },
    }),
  },
});
```

Authorize the complete selector, including parameters, extensions and explicit
event intent, for your application. The example rejects all caller-supplied
resolve overrides. To support any overrides, explicitly authorize the permitted
fields and values through the same callback. Use the candidate URL in
`context.url` for selector authorization. For a direct endpoint request,
`event.url` names the preparation endpoint.
Server consent remains authoritative; browser input may narrow it. Identity
cookies do not grant consent. Configure `cookie` consistently with the browser
owner's path, domain, secure and same-site policy. Application consent cookies
communicate explicit decisions to `consent.server`. Web and eligible SSR
documents manage the separate
`ctfl-opt-aid` identity cookie under persistence consent.

```ts
// src/hooks.server.ts — compose with any existing hooks.
import { request } from '$lib/server/experiences';
export const handleFetch = request.handleFetch;

// src/routes/_exo/primary/+server.ts
import { request } from '$lib/server/experiences';
export const POST = request.handlePreparation;
```

The handlers own one request-local Node facade per operation and destroy it after
projection, including errors. The required `request.mode` accepts `'ssr'`,
`'hybrid'`, or a synchronous or asynchronous `(event, context) => mode`
callback. The adapter resolves the callback once for each authorized ordinary
initial document preparation. In SSR mode, the server owns the initial page
attempt and hydration skips the browser page attempt. Only these SSR
documents can write or expire identity cookies, using the final request profile
and persistence consent. Hybrid mode prepares a transfer for browser replay.
Direct endpoint calls and Kit data requests and subrequests remain noncommitting.
Event-free reads remove event intent. Incoming route URLs select configured
Preview capability. Preview prepares content without visitor state, replay or
identity cookie changes.

The endpoint and its containing document use `Cache-Control: private, no-store`.
Coordinate the document header with other loaders to avoid duplicate writers.
Keep complete request results and handoffs out of logs, shared caches and
prerendering. See [XDA preflight and profile finalization](../runtime/README.md#xda-preflight-and-profile-finalization)
for the distinction between local admission and deployed commitment.

For an application-owned public or prerendered route, fetch content separately
without visitor state or event intent. The server-only `serializePlan(plan,
{ metadataKeys })` export in `@contentful/experiences-svelte/kit/server` uses the
same strict JSON projection as managed Kit preparation. It returns a detached
plan with an empty diagnostics list and only explicitly allowlisted metadata
keys. Delivery diagnostics, raw errors and visitor fields such as
`personalization` stay server-side. Non-JSON values in the projected data throw
a `TypeError`. Resolver-produced node data and allowlisted metadata still need
application review for public use, and the application owns the response's
cache policy.

### Kit document redirects and missing pages

The application can use `request.onResult(event, result)` in its server
configuration to record a projected outcome in request-local state. Keep the
captured-fetch response intact. After `resolve(event)`, the outer `handle` can
map a validated Destination redirect or a missing-content outcome to HTTP for
the matching successful HTML document. Add this callback to the server
configuration's `request` object using an application validator such as
`isLocalRedirectPath` from the [SvelteKit example](../../examples/sveltekit/src/lib/server/experiences.ts).

```ts
// Inside request: { ... } in src/lib/server/experiences.ts
onResult(event, result) {
  if (event.route.id !== '/[...path]' || event.isDataRequest || event.isSubRequest ||
      !['GET', 'HEAD'].includes(event.request.method)) return;
  const routeKey = event.url.pathname + event.url.search;
  if (result.routeKey !== routeKey) return;
  const target = result.redirect?.path;
  event.locals.exoDocumentOutcome = {
    routeKey,
    notFound: result.notFound === true,
    ...(isLocalRedirectPath(target) ? { redirect: target } : {}),
  };
},
```

```ts
// src/app.d.ts — merge into the application's existing App.Locals.
declare global {
  namespace App {
    interface Locals {
      exoDocumentOutcome?: { routeKey: string; notFound: boolean; redirect?: string };
    }
  }
}
export {};
```

```ts
// src/hooks.server.ts — alongside handleFetch.
import type { Handle } from '@sveltejs/kit';
export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  const outcome = event.locals.exoDocumentOutcome;
  if (
    event.route.id === '/[...path]' &&
    !event.isDataRequest &&
    !event.isSubRequest &&
    ['GET', 'HEAD'].includes(event.request.method) &&
    outcome?.routeKey === event.url.pathname + event.url.search &&
    response.status === 200 &&
    response.headers.get('content-type')?.startsWith('text/html')
  ) {
    if (outcome.redirect) {
      const headers = new Headers(response.headers);
      headers.set('location', outcome.redirect);
      headers.delete('content-length');
      headers.delete('content-type');
      return new Response(null, { status: 307, headers });
    }
    if (outcome.notFound) {
      return new Response(response.body, {
        status: 404,
        statusText: 'Not Found',
        headers: response.headers,
      });
    }
  }
  return response;
};
```

The 307 preserves the document's private headers. The 404 keeps the same
application-rendered body and serialized `page.status`; the route snippet owns
missing-page UI. A Preview acquisition 404 follows the Preview error path, and
an empty plan is a successful result. Enhanced browser navigation follows valid
Destination redirects after commitment.

See the [SvelteKit example](../../examples/sveltekit/README.md) for the complete
composition, including consent and optional Preview configuration.

### Managed browser integration

Bind your registry once in a portable module:

```ts
import { createExperiences } from '@contentful/experiences-svelte';
import { experienceConfig } from './experience-config';

export const {
  ExperiencesRoot,
  ExperiencesProvider,
  Experience,
  ExperienceRenderer,
  useManagedExperience,
} = createExperiences({
  config: experienceConfig,
  onRedirect({ path }) {
    // The host owns navigation and validation of its allowed redirect targets.
    if (!path.startsWith('/')) return;
    const target = new URL(path, window.location.origin);
    if (target.origin === window.location.origin) window.location.assign(target);
  },
});
```

```svelte
<script lang="ts">
  import { ExperiencesRoot, Experience } from './experiences';
  // Supply an immutable snapshot from your host router after commitment.
  let { route }: { route: { pathname: string; search: string; hash: string; title: string } } = $props();
  const routeKey = $derived(route.pathname + route.search);
  const pagePayload = $derived({
    properties: { title: route.title, path: route.pathname, search: route.search, hash: route.hash },
  });
</script>

{#snippet baseline()}<p>Browse our storefront.</p>{/snippet}

<ExperiencesRoot spaceId="your-space" environmentId="master"
  delivery={{ accessToken: 'browser-scoped-token' }}
  {routeKey} initialPagePayload={pagePayload} buildPagePayload={() => pagePayload}>
  <Experience destinationId="your-destination" path={route.pathname}
    loadingFallback={baseline} errorFallback={baseline} />
</ExperiencesRoot>
```

Binding constructs no Web SDK. One stable root owns one browser activation;
`ExperiencesProvider` instead captures one caller-owned `sdk` per activation and
never constructs or destroys it; later `sdk` prop changes are ignored. An explicit
key/remount can capture a fresh SDK after the caller retires the old instance.
Use separate browser credentials or an authenticated proxy. The supplied-plan
`ExperienceRenderer` removes only the registry prop from the existing renderer;
it starts no content fetch or Preview subscription and needs no managed root.

`Experience` selects by `experienceId`, `destinationId` + `path`, or
`destinationId` + `nodeId`. By-ID calls retain `parameters` and `extensions`;
Destination selectors reject either field when defined. `locale`,
`personalization`, `metadata`, `debug` and `resolveOptions` retain their runtime
meanings. Selectors are validated before seeds or normalization. `initialPlan`
and `initialError` seed the operation without a startup content fetch, including
successful empty content. The root presents one current primary. Equivalent
content-only inputs share it; a changed selector supersedes the earlier input,
including while the outgoing view is animating. A selectorless `Experience`
observes that primary. Render its plan through `ExperienceRenderer` for additional
presentations; selecting inputs do not create a multi-Experience loader.

Call the bound `useManagedExperience(() => ({ experienceId }))` during component
initialization to select reactively, or `useManagedExperience()` to observe the
current primary. Read `status`, `data`, `error`, `redirect` and `result` from the
returned object to keep Svelte reactivity. The object also exposes
`acquire()`, `retry()` and `refresh()`.
`result` describes the complete current local operation; `data` is the applicable
displayed plan and may retain an earlier complete plan during an acquisition failure,
including offline, timeout and unclassified transport errors. Retention requires
that the source, visitor identity, route, locale and Preview session remain applicable; authoritative
missing/auth outcomes select baseline. The latest result/error stays separate from
that retained plan. `result?.notFound` marks an authoritative missing-content
outcome; applications can render a recognizable “Page not found” message and
return link in their snippet. Preview acquisition 404s and successful empty plans
do not set that flag.

Call `current.acquire({ personalization })` in an explicit browser action when
you want to fetch the committed selection with new personalization intent. The
action uses the same Web SDK and updates the shared presentation. It resolves
to a browser `ManagedExperienceOperationResult`, or `undefined` when there is
no eligible committed selection or the action becomes stale. Preview sessions
have their own content source and suppress this action.

```svelte
<script lang="ts">
  import { useManagedExperience } from './experiences';

  const current = useManagedExperience();

  async function seeRecommendations() {
    await current.acquire({
      personalization: {
        events: [{ type: 'track', event: 'Requested recommendations' }],
      },
    });
  }
</script>

<button type="button" onclick={seeRecommendations}>Show recommendations</button>
```

The declarative alternative uses an ordinary registry-bound `Experience` with
the current selector and `personalization.events`. Mounting an unseeded selecting
view with nonempty explicit events declares fresh intent. Key the selecting view
for each deliberate action, including identical actions while outgoing DOM is
animating, and keep the SDK root mounted. Unchanged rerenders leave that intent
alone.

Retry and refresh are event-free reads of the currently selected source. After
an explicit acquisition, they use the SDK's current visitor identity; caller
personalization applies only to that acquisition. The portable and Kit managed
accessors both observe the displayed plan, including
when acquisition switches source. Each accessor's `result` exposes the raw
operation of its own family and is `undefined` while the other family is current.
Use the value returned by `acquire()` to inspect its browser operation directly.

Visitor reset preserves the completed displayed plan and its exact operation
result. It clears visitor state and ends pending work and old page intent without
fetching replacement content, replaying events or repeating resolution callbacks.
A canceled refresh restores that completed presentation; a new explicit refresh
can load replacement content without creating page intent. Applications requiring
immediate concealment clear or unmount the presentation explicitly. Source, route,
locale and Preview-session changes still apply their own content boundaries.

Without usable content, `loadingFallback` or `errorFallback` renders the
application baseline. Usable applicable content takes priority over these
fallbacks. A `children` snippet receives the managed result and takes explicit
control over presentation. The SDK renders no raw content error text by default.
`onExperienceResolved(current)` and `onExperienceError(error, current)` run after
presentation commits, including an error alongside retained content. Replacing a
callback does not repeat a notification. `onRedirect(redirect, current)` may be
overridden on a presentation; host navigation runs once for the primary outcome.
A thrown redirect callback becomes a managed content error.

The host supplies committed route props only: pending, canceled and preload-only
navigation must leave them unchanged. `routeKey` starts with `/` and is compared
verbatim. Ordinary routers should use pathname plus the original search string,
without re-encoding its query or including ordinary fragments. Hash routers may
choose a root-relative logical identity. With Preview enabled, a hash router must
use the full committed `pathname + search + hash`, for example
`/shell?preview_session_id=one#/products`, so session entry/change/exit changes the
existing `routeKey`. The host must report that commitment; the SDK does not observe
unreported URL mutations or require a Preview-specific component key/wrapper.
Pass pathname alone for Destination lookup. Payload/callback-only updates do not
start another page attempt. The root connects page intent, consent retry and an
optional actual server handoff to existing Web policy; applications need no manual
page send. Only replay matching the committed route suppresses XDA page injection;
mere handoff presence does not. Web owns complete hydration/replay validation.
Retained content never replays its previous handoff. Pair a complete server
handoff with its returned plan/error as the presentation seed; the handoff itself
carries state/events, not the content seed.
Automatic consumption of the optional root handoff belongs to that committed
route's owner lifetime. Reset ends that authority; replacing the prop on the same
route does not restore it. Event-consent changes cancel event work through Web's
own admission policy while leaving the owner/content lifetime intact. The still-
current eligible page can retry after explicit denial→grant or withdrawal→grant.
For an explicit page in an ordinary browser acquisition, the consent retry uses
its builder arguments. A bare `{ type: 'page' }` uses browser defaults. For a
built page event, the retry preserves properties and supported context
(`campaign`, `locale`, `location`, `page` and `userAgent`) while the SDK builds
a fresh event with current identity and consent. Blocked nonpage intent stays
dropped. A fresh application-owned transfer can use Web's explicit
complete-handoff operation.

Configure optional `preview` capability on the root. A nonempty trimmed
`preview_session_id` in the committed URL selects isolated Preview mode. The same
managed presentation consumes runtime snapshots and matching updates; session
entry, exit and replacement end the old owned activation before creating another.
Snapshot/socket failures preserve applicable content from the same session or the
application baseline. Event-consent changes do not cancel Preview content,
including snapshot-only acquisition; owner reset, source/locale/session changes
and destruction still guard delayed content. Legacy owning Preview hooks remain available for existing
consumers. Static/supplied use is allowed inside managed roots without changing
the active owner's Preview status. The managed root rejects a competing Preview
client.

### Astro and embedded hosts

An Astro host can place a whole Svelte presentation in one island. Bind the
Svelte component registry and resolver functions in an imported Svelte module.
Pass only serializable selectors or projected public plan data through island
props. Keep named snippets and Svelte context inside the island; each separately
mounted island has its own context. Hydrate the whole Svelte island, for example
with Astro's `client:load` directive. This hydrates the island's Experience tree
together.

For managed content, put the portable `ExperiencesRoot` and its consumers
inside the same island and give it committed host route inputs. To share a Web
SDK across islands, let each hydrated island acquire the same instance from an
application-owned browser module and pass it to an `ExperiencesProvider` inside
that island. Keep the SDK out of serialized Astro props. Each island tears down
its own runtime binding. The application destroys the SDK after the last consumer
detaches. Siblings can also render the same supplied plan independently.

On Node 24.21.0, a local packed Astro 7.4.12 check used `@astrojs/svelte` 9.1.6,
`@astrojs/node` 11.1.9 and `svelte-check` 4.7.8. It verified SSR and hydration
of a supplied plan with nested named slots and an interactive component, and
observed separate islands sharing one application-owned SDK with independent
teardown. SSR constructed no Web SDK. The maintained Astro example uses
React's custom renderer.

### Shared concepts across React, Next.js and Svelte

| Concern                 | React / Next.js                                                                             | Svelte / SvelteKit                                                                                                                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Packages                | React and Next.js packages, with explicit router entries and Next.js RSC/App/Pages families | One Svelte package with independent portable exports and optional `/kit/server` and `/kit/client` entries.                                                                                                                                                             |
| Bind once               | React `createExperiences` or a Next.js router binding                                       | Portable `createExperiences` binds the registry and returns a root, provider, managed view, supplied-plan renderer and managed accessor. The Kit browser binding returns the request family and pairs with a server binding.                                           |
| Runtime ownership       | `ExperiencesRoot` owns the runtime and `ExperiencesProvider` receives one                   | The same ownership concepts use Svelte context and lifecycle. The caller destroys an injected SDK.                                                                                                                                                                     |
| Result and presentation | Managed result and loading/error presentation                                               | Read reactive `status`, `data`, `error`, `redirect` and `result` on the bound accessor. Load and error snippets and post-commit notifications adapt presentation. Retry and refresh are event-free.                                                                    |
| State and actions       | Runtime hooks and SDK event methods                                                         | `getExperiences()`, `getExperiencesState()` and `getExperiencesActions()` expose the shared runtime, readiness, errors and policies. Singular `getExperience()` reads render context.                                                                                  |
| Named slots             | Named `ReactNode[]` props                                                                   | Named `Snippet[]` props, one snippet per child, rendered with `{#each}` and `{@render}`. `children` is a conventional slot name.                                                                                                                                       |
| Server transfer         | Complete Next.js request result with router-specific presentation                           | SvelteKit uses native loader data, ordinary SSR and hydration, and one complete-result adoption path for the request root.                                                                                                                                             |
| Routing                 | Explicit route input or optional router integrations                                        | Vite and embedded hosts supply committed route identity, payload and redirect handling. Kit integrates with native navigation, loaders and invalidation. Ordinary hashes are metadata; hash routers supply logical identity and include the committed URL for Preview. |
| Tracking roots          | Root attributes or React root bindings                                                      | Forward tracking props onto actual Svelte DOM roots. Use `getRootProps` for cooperative multi-root components. Web owns discovery, consent and measurement.                                                                                                            |
| Astro                   | A React custom renderer is available for native islands                                     | A whole Svelte island keeps the registry in module scope and receives serializable props. Svelte context and snippets stay inside it.                                                                                                                                  |
| Rendering errors        | React client boundaries and host-specific server behavior                                   | Native Svelte per-node fallback, optional reset, and host-configured SSR recovery. Kit 2 needs async compilation and rendering-error handling; Kit 3 uses the native error hook. The host owns safe error messages and HTTP status.                                    |

### Migration

| Existing integration                                                                | Managed equivalent                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manual Kit load and per-route renderer                                              | Import `bindSvelteKitServerExperiences` from `/kit/server` and `bindSvelteKitClientExperiences` from `/kit/client`. Return `request.loadExperience(...)` from the universal loader and pass the committed source to the destructured `ExperiencesRoot`. Render the destructured `Experience` under it. Use `current.data` to read the displayed plan and `current.result` for the latest operation. |
| Per-view `useLivePreview` or `useLivePreviewExperience` with a token and session ID | Move capability into the managed browser and, for Kit, server configuration. The committed URL supplies the session ID. Bind the desired Experience with the ordinary selector, read its displayed plan through `useManagedExperience()` and connection status through `getExperiencesState().preview`.                                                                                             |
| Kit consent panel constructing its own Web SDK                                      | Remove the panel's SDK construction and teardown. Read consent/readiness from `getExperiencesState()` and call `getExperiencesActions().consent(...)` under the existing root. Continue to supply the application consent choice to `consent.server` for server-owned work.                                                                                                                         |
| Existing manually supplied plans and payloads                                       | Keep `ClientExperienceRenderer`, `ServerExperienceRenderer`, `useExperiencePlan`, and existing imports. For a static seed under a managed root, the legacy Preview hooks can still read supplied content with `previewSessionOptions` omitted.                                                                                                                                                      |

For a managed Kit Preview view, add gated `preview: { accessToken, createClient:
createLivePreviewClient }` to the browser binding from the [managed setup](#managed-sveltekit-integration).
Add `@contentful/experiences-live-preview` to the app's dependencies to import
the optional factory. For a
server-backed route, add corresponding `preview: { accessToken }` to the server
binding using a private Preview credential. Use an explicitly browser-approved
token or trusted proxy for the browser capability. Pass the session in
`?preview_session_id=...` and keep the regular request-root and selector setup.
The root owns activation and Web owns its connection, matching updates, event
suppression and teardown. The session owns Preview locale, parameters and
extensions. The [Kit example selectors](../../examples/sveltekit/src/lib/load-experience.ts)
omit Delivery-only options such as the by-ID source-map request when Preview
is active. For a portable root configure `preview` on `ExperiencesRoot`.
Managed roots reject legacy hooks that attempt to create their own connection.

For example, a consent component under the Kit root can use:

```svelte
<script lang="ts">
  import { getExperiencesActions, getExperiencesState } from '@contentful/experiences-svelte';

  const state = getExperiencesState();
  const actions = getExperiencesActions();
  const canSendEvents = $derived(state.consent === true);
</script>

<button type="button" disabled={!state.ready || canSendEvents}
  onclick={() => actions.consent({ events: true })}>
  Allow events
</button>
```

Call the getters during component initialization and read their properties
reactively. The same rule applies to `current.data` and the other managed result
getters.

### Service verification

Local checks cover Preview configuration, session selection, event suppression,
lifecycle, and Destination selector, result and redirect handling. Live Preview
acquisition, snapshots and updates, and live Destinations walkthroughs and
attribution remain deferred. Prior live Destination responses omitted both
source maps and node IDs required for attribution. Follow Runtime's [Destination limits](../runtime/README.md#destination-selection).

Upstream event commitment and profile finalization require deployed behavior
verification beyond local rendering, browser adoption and SDK event acceptance.
The SDK release hold remains until the tracked XDA issues are resolved and
corrected deployed behavior is verified. See [XDA preflight and profile finalization](../runtime/README.md#xda-preflight-and-profile-finalization).

### Authoring

```ts
defineComponent<Props>(config); // Type-narrowing identity for component-type configs
defineExperienceTemplate<Props>(config); // Same shape, for coded Experience Template configs
```

### Fetching

For a complete `+page.server.ts` loader and `ServerExperienceRenderer` example,
see [manual SvelteKit loading and rendering](../../README.md#manual-sveltekit-loading-and-rendering).

```ts
fetchExperience(experienceOptions, clientOptions, resolveOptions); // Async; fetches by Destination path/node id or Experience id and resolves in one call
fetchDestinationSitemap(destinationOptions, clientOptions, paginationOptions?); // Async; lists every routable path in a Destination
fetchPreviewSession(previewSessionOptions, clientOptions, resolveOptions); // Async; fetches and resolves a Preview Session Experience
```

Serve pages from a Destination: the URL path is the Destination path. A redirect node comes back as a value, not an error. Free fetches use ordinary Delivery. Use the Preview Session helpers below for session content; the free fetch API has no per-call preview toggle.

```ts
const result = await fetchExperience(
  { spaceId, destinationId, path: '/demo/landing' },
  { accessToken },
  { config: experienceConfig }
);
if ('redirect' in result) {
  // follow it: navigate to result.redirect.path
}
// otherwise `result` is a PortableRenderPlan

// Enumerate every routable path, for example to prerender
const sitemap = await fetchDestinationSitemap({ spaceId, destinationId }, { accessToken });
const paths = sitemap.items.map((item) => item.path); // follow sitemap.pages.next for more
```

These are low-level Preview Session helpers: read a nonempty, trimmed
`preview_session_id` from the incoming request or browser URL and pass it as
`sessionId`. Their `previewToken` remains the helper credential API. When using
a Node/Web runtime owner, configure optional `preview` capability once; the URL
ID activates session mode, and no configuration or ID leaves ordinary Delivery.
Bare Node binds the ID through `forRequest({ preview: { sessionId } })`.
See the [Runtime preview contract](../runtime/README.md#optional-runtime-live-preview).

Use `fetchPreviewSession` for the initial render when the Contentful app
provides a `preview_session_id`. It fetches the current Preview Session
snapshot and resolves it into a `PortableRenderPlan`. Use `useLivePreview` to
receive subsequent WebSocket updates:

```ts
const plan = await fetchPreviewSession(
  { spaceId, environmentId, sessionId },
  { previewToken },
  { config: experienceConfig }
);
```

If the Preview Session references resources from other spaces, pass the same
encoded `resourceResolution` value in the `previewSessionOptions` passed to
`fetchPreviewSession` and `useLivePreview`.

### Resolver

```ts
resolveExperience(payload, config, opts?); // Async; walks payload, runs resolveData, returns a PortableRenderPlan
```

### Live preview

For applications using a managed root, configure [managed Preview](#migration).
The following getters remain available for an application-owned standalone
Preview connection, or to read supplied content under a managed root with no
Preview session options.

Use `useLivePreview` when the app should subscribe to Preview Session updates,
resolve each payload, and render the resulting plan from `data`:

```svelte
<script lang="ts">
  import { ClientExperienceRenderer, useLivePreview } from '@contentful/experiences-svelte';

  const livePreview = useLivePreview(() => ({
    previewSessionOptions,
    initialPayload,
    initialPlan,
    resolveOptions: { config: experienceConfig },
  }));
</script>

<ClientExperienceRenderer experience={livePreview.data} config={experienceConfig} />
```

For separate access to the raw payload and rendered plan, use
`useLivePreviewExperience` and `useExperiencePlan`:

```svelte
<script lang="ts">
  import {
    ClientExperienceRenderer,
    useExperiencePlan,
    useLivePreviewExperience,
  } from '@contentful/experiences-svelte';

  const livePreview = useLivePreviewExperience(() => ({
    previewSessionOptions: {
      spaceId,
      environmentId,
      previewToken,
      sessionId,
    },
    initialPayload,
  }));

  const plan = useExperiencePlan(() => ({
    payload: livePreview.data,
    initialPlan,
    resolveOptions: { config: experienceConfig },
  }));
</script>

<ClientExperienceRenderer experience={plan.data} config={experienceConfig} />
```

`useLivePreviewExperience` returns the latest raw Experience payload.
`initialPayload` seeds the first value. `useExperiencePlan` turns that payload
into the `PortableRenderPlan` consumed by the renderer and keeps the current rendered
experience while an update is being resolved.

The live-preview results also expose `error` when the Preview Session connection
fails. The last valid `data` remains available.

### Renderers

```ts
ServerExperienceRenderer; // SSR-safe renderer
ClientExperienceRenderer; // Client renderer
MissingComponent; // Default fallback for unregistered component types
NodesRenderer; // Exposed so you can re-render a slot's raw nodes yourself (see Slot children)
```

### Component errors and rendering recovery

Registered nodes already have a native `<svelte:boundary>` with a `failed`
snippet. Both renderers accept `renderError`, a Svelte component with
`ComponentErrorProps`: `componentId: string`, `nodeId?: string`,
`message?: string` and `reset?: () => void`. The message comes from the boundary
error, including a host-transformed plain object's `message`. The default
`ComponentError` fallback is visible only in debug mode and has no retry button.
A custom fallback controls its own visibility:

```svelte
<!-- ComponentFallback.svelte -->
<script lang="ts">
  import type { ComponentErrorProps } from '@contentful/experiences-svelte';
  let { componentId, nodeId, reset }: ComponentErrorProps = $props();
</script>

<div data-render-error={componentId} data-node-id={nodeId}>
  <p>This component could not be displayed.</p>
  {#if reset}
    <button type="button" onclick={() => reset?.()}>Try rendering again</button>
  {/if}
</div>
```

```svelte
<script lang="ts">
  import { ServerExperienceRenderer } from '@contentful/experiences-svelte';
  import ComponentFallback from './ComponentFallback.svelte';
  import { experienceConfig } from './experience-config';
  import type { PortableRenderPlan } from '@contentful/experiences-svelte';
  let { experience }: { experience: PortableRenderPlan } = $props();
</script>

<ServerExperienceRenderer {experience} config={experienceConfig}
  renderError={ComponentFallback} />
```

`reset` retries this node's rendering. It neither fetches content nor resets
visitor SDK state; managed `retry()` is a separate event-free content fetch.
The native SSR callback is a no-op; hydration supplies a working browser callback.
A component that still throws returns to the fallback. If the fallback itself
throws, the error bubbles normally to an outer boundary or the host.

Svelte supports `failed` boundary SSR recovery through
`render(..., { transformError })` since 5.51 (verified on 5.57.3; supported peer
`^5.55.7`). The default transform rethrows, so SSR recovery requires host setup.
For **Kit 2.70.4**, merge both opt-ins into your existing `svelte.config.js`,
preserving other compiler, Kit and experimental options:

```js
// Fields in the existing exported configuration object.
compilerOptions: { experimental: { async: true } },
kit: { experimental: { handleRenderingErrors: true } },
```

`kit.experimental.handleRenderingErrors` defaults to `false`. Kit 2's rendering
transform is always async, so this option alone is insufficient: async compilation
is also required. **Kit 3.2.0** wires native SSR recovery through `handleError`
automatically; the synchronous hook below needs no async opt-in. Promise-returning
hooks require async compiler mode. Kit passes the original exception to the server
hook; compose this handling with your existing hooks:

```ts
// src/hooks.server.ts
import type { HandleServerError } from '@sveltejs/kit';

export const handleError: HandleServerError = ({ error }) => {
  console.error(error); // Original exception stays in server logs.
  return { message: 'This component could not be displayed.' };
};
```

For standalone Svelte SSR, pass a safe transform to your existing render call:

```ts
import { render } from 'svelte/server';
import Page from './Page.svelte';

const rendered = render(Page, {
  props: { experience }, // The page above imports its registry and fallback.
  transformError(error) {
    console.error(error);
    return { message: 'This component could not be displayed.' };
  },
});
```

The standalone transform above is synchronous. Promise-returning transforms or
hooks require `compilerOptions.experimental.async: true` and awaited rendering
(`await render(...)` for standalone SSR). Awaiting `render` alone cannot enable
async mode: synchronous-compiled Svelte 5.57.3 fails with `await_invalid` when a
transform returns a Promise.

Return a plain JSON-safe public error for SSR serialization; do not return the
raw exception or stack, or copy a private exception message into public output.
The framework owns sanitization and HTTP status. A recovered fallback does not
promise HTTP 200. Svelte's SSR compiler ignores boundary `onerror`, so the host
handler reports the original server exception; SDK `DebugExperience` does not
list those SSR component exceptions. Browser boundary `onerror` reports the SDK
diagnostic, including during hydration with the sanitized error message.

### Styling + runtime context (helpers)

```ts
getDesignValues<T>(); // Escape hatch: the same resolved design record that auto-fills props; read in a $derived to stay reactive
toCss(design, options?); // Turns a design record into a plain style object, keeping only real CSS keys
getExperience(); // RenderContext: debug, metadata
getContentfulComponent(); // Raw payload for the enclosing node (or undefined), including `attribution`
getContentfulExperienceTemplate(); // Same, for an enclosing coded Experience Template node
getTrackingAttributes(attribution); // Attributes to spread on a node's outermost element for interaction tracking
type ToCssOptions;
```

Resolved design values are **auto-filled onto your component's props** by key, alongside content. Styling from `$props()` is the one recommended path. `getDesignValues()` exposes the same record as an escape hatch. Reach for it only for a nested child that isn't itself a registered component, or for design needed outside the render path (an effect, an imperative measurement) — see [Styling components](../../README.md#styling-components). Token resolution is configured with `resolveToken` on your `Config` (`type ResolveToken`).

### Tracking roots

Forward the provided attribution attributes and caller attachments to each
registered component's actual DOM root. A component with one root can spread its
remaining element props after taking its content, design and slot props.
For a component that selects its own roots, configure
`root: { prop: 'experienceRoot' }` in its registry entry. Its
`experienceRoot?: ExperienceRootBinding` prop supplies
`getRootProps(key?, props?)`. Spread that result on each intended element.
Explicit element props take precedence, and Web owns discovery, consent and
measurement. Each real DOM root is measured separately within the nearest
attributed Experience container.

### Re-exported types and utilities

```ts
// From core
type Config, Components, ExperienceTemplates, Registration, ExperienceTemplateRegistration,
type ComponentConfig, ExperienceTemplateConfig,
type ContentfulComponent, ContentfulExperienceTemplate,
type RenderContext, ResolveToken,
type ExperiencePayload, ExperienceNode, ComponentNode, ExperienceTemplateNode,
type PortableRenderPlan, PortableRenderNode, PortableRegistration,
type DesignPropValue, ManualDesignValue, DesignToken, ExperienceContext, ResolveContext,
type ResolverConfig, ResolveExperienceOptions

// From design
isCssProperty, toCssKey, CSS_PROPERTIES

// From client
fetchExperience, fetchDestinationSitemap, fetchPreviewSession, createClient, ContentfulViewDelivery,
ContentfulViewDeliveryClient, NotFoundError, PreviewSessionFetchError,
LivePreviewConnectionError,
DELIVERY_HOST, PREVIEW_HOST, PREVIEW_WEBSOCKET_HOST

type ExperienceOptions, ByIdExperienceOptions, ByDestinationPathExperienceOptions,
  ByDestinationNodeIdExperienceOptions, DestinationRedirectResult, DestinationSitemapResult,
  FetchDestinationSitemapOptions, FetchDestinationSitemapPaginationOptions, SitemapPathItem,
  PreviewSessionExperienceOptions, PreviewSessionClientOptions,
  PreviewSessionResolveOptions, ClientOptions, ResolveOptions, CreateClientOptions
```

---

## Quick reference

```svelte
<!-- Button.svelte: content + resolved design both arrive as props -->
<script lang="ts">
  interface ButtonProps {
    label?: string;
    url?: string;
    backgroundColor?: string; // resolved design, auto-filled
    color?: string;
  }

  let { label = 'Button', url, backgroundColor, color }: ButtonProps = $props();
</script>
{#if url}
  <a href={url} style="background: {backgroundColor}; color: {color};">{label}</a>
{:else}
  <button type="button" style="background: {backgroundColor}; color: {color};">{label}</button>
{/if}
```

```ts
// experience-config.ts
import {
  defineComponent,
  type Components,
  type Config,
  type ResolveToken,
} from '@contentful/experiences-svelte';
import Button from './components/Button.svelte';
import type { ButtonProps } from './components/Button.svelte';

const components: Components = {
  // Bare component, or defineComponent({...}) when you need defaults/resolveData.
  Button: defineComponent<ButtonProps>({
    resolveData: ({ content }) => ({ url: ensureScheme(content.url) }),
    component: Button,
  }),
};

const resolveToken: ResolveToken = (token) => designTokens[token.value];

export const experienceConfig: Config = { components, resolveToken };
```

```svelte
<!-- +page.svelte -->
<script lang="ts">
  import { ServerExperienceRenderer } from '@contentful/experiences-svelte';
  let { data } = $props();
</script>
<ServerExperienceRenderer experience={data.experience} config={experienceConfig} />
```

### Slot children

Every slot arrives as a prop named after the slot, holding an **array of Snippets** (`Snippet[]`), one per child — not a single wrapping Snippet. For the common "just render them" case, iterate the array with `{#each}` and `{@render}`; to wrap, reorder, or drop children individually, do it inside that loop.

```svelte
<!-- Section.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { children }: { children?: Snippet[] } = $props();
</script>

<!-- Common case — render them all: -->
<div>
  {#each children ?? [] as child}
    {@render child()}
  {/each}
</div>

<!-- Or take control of each child: -->
<!--
<div>
  {#each children ?? [] as child, i}
    <div class="cell">{@render child()}</div>
  {/each}
</div>
-->
```

`children` is not special — it is simply the conventional name for the default slot. **Every** slot in the payload becomes a same-named `Snippet[]` prop, so a component with a `header` slot just declares `header?: Snippet[]` and renders it the same way. This applies identically to coded Experience Templates: a template with a `content` slot receives a `content` prop.

If you'd rather render a slot's raw nodes yourself, they are still on the payload at `getContentfulComponent().slots` (a `Record<string, PortableRenderNode[]>`) — hand them to `NodesRenderer`.

For the full getting-started walkthrough, merge-precedence rules, and design rationale, see the [root README](../../README.md) and [`AGENTS.md`](../../AGENTS.md).

---

## License

MIT. See the repository [`LICENSE`](../../LICENSE) and [`NOTICE`](../../NOTICE) for full attribution.

## Runtime Experience parameters

By-ID `fetchExperience` accepts `parameters`, for example
`{ featuredPosts: { limit: 6, order: '-fields.title' } }`. Scalars are strings or
numbers; Record leaves have one level. Order is one signed `fields.<apiName>` or
`sys.<id>` path. Refetch with changed values, then replace the renderer's plan.
Exports include `ExperienceParameters`, `ExperienceParameterValue`,
`ExperienceParameterRecord`, and `ExperienceParameterOrder`.
See the [collection/refetch example](../../README.md#runtime-experience-parameters).
