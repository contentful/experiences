# @contentful/experiences-svelte

> ⚠️ **Alpha.** Published to npm. APIs are unstable and will change.

The Svelte adapter for the Contentful Experiences SDK. You bring your own Svelte 5 components; it renders Experience payloads from the Experience Delivery API (XDA) with them.

```sh
npm install @contentful/experiences-svelte
```

This is the only rendering SDK package you install. It re-exports everything you need from `@contentful/experiences-sdk-core`, `@contentful/experiences-design`, and `@contentful/experiences-client`. The optional `@contentful/experiences-live-preview` package is also customer-facing and provides the framework-neutral live-preview client.

The authoring and supplied-rendering APIs follow `@contentful/experiences-react`; the rendering primitives change (Svelte 5 `Component`s, Snippets instead of `children: ReactNode`, and `getDesignValues()` instead of `useDesignValues()`).

---

## Public API

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
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return;
    window.location.assign(path);
  },
});
```

```svelte
<script lang="ts">
  import { ExperiencesRoot, Experience } from './experiences';
  // Supply an immutable snapshot from your host router after commitment.
  let { route }: { route: { pathname: string; search: string; title: string } } = $props();
  const routeKey = $derived(route.pathname + route.search);
  const pagePayload = $derived({ properties: { title: route.title, path: route.pathname } });
</script>

<ExperiencesRoot spaceId="your-space" environmentId="master"
  delivery={{ accessToken: 'browser-scoped-token' }}
  {routeKey} initialPagePayload={pagePayload} buildPagePayload={() => pagePayload}>
  {#snippet baseline()}<p>Browse our storefront.</p>{/snippet}
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
current primary. Read properties on its returned object to keep Svelte reactivity:
`status`, `data`, `error`, `redirect`, `result`, `retry()` and `refresh()`.
`result` describes the complete current local operation; `data` is the applicable
displayed plan and may retain an earlier complete plan during an acquisition failure,
including offline, timeout and unclassified transport errors. Retention requires
that the source, visitor identity, route, locale and Preview session remain applicable; authoritative
missing/auth outcomes select baseline. The latest result/error stays separate from
that retained plan. `result?.notFound` marks an authoritative missing-content
outcome; applications can render a recognizable “Page not found” message and
return link in their snippet. Preview acquisition404 and successful empty plans
do not set that flag.
Retry and refresh are event-free reads. For an explicit browser action below a
hydrated Kit request root, render an ordinary registry-bound `Experience` with
the current selector and `personalization.events`. Mounting an unseeded selecting
view with nonempty explicit events declares fresh intent. A new keyed view starts
each deliberate action, including identical repeated actions while outgoing DOM
is animating; keep the SDK root mounted. Unchanged rerenders do not repeat that
intent. The action uses Web fetching, and Retry follows the currently
selected source without repeating its events. Native Kit revalidation remains
event-free for an unchanged URL and content selection. Both result families can
observe the displayed plan, but `result` is undefined when the current operation
belongs to the other family; raw request results are never rewritten as browser
operations or overlaid with retained content.

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
current eligible page can retry after explicit denial→grant or withdrawal→grant;
blocked nonpage intent is never restored. A fresh
application-owned transfer can use Web's explicit complete-handoff operation;
native Kit request identity and adoption are separate integration work.

Configure optional `preview` capability on the root. A nonempty trimmed
`preview_session_id` in the committed URL selects isolated Preview mode. The same
managed presentation consumes runtime snapshots and matching updates; session
entry, exit and replacement end the old owned activation before creating another.
Snapshot/socket failures preserve applicable content from the same session or the
application baseline. Event-consent changes do not cancel Preview content,
including snapshot-only acquisition; owner reset, source/locale/session changes
and destruction still guard delayed content. Legacy owning Preview hooks remain available for existing
consumers. Static/supplied use is allowed inside managed roots without changing
the active owner's Preview status; supplying a competing Preview client is refused. Managed Kit loading, adoption and example migrations are separate integration work.
Native server preparation is described below.

### Kit client foundation

`bindSvelteKitClientExperiences` from `/kit/client` binds `request.init`,
`request.ExperiencesRoot` and `request.ExperiencesProvider`. With browser-safe Web
configuration, it creates an owned SDK at activation. Alternatively, select an
existing caller-owned SDK before init; no duplicate credentials are required:

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

For Kit early startup, export the chosen binding's `request.init` from
`hooks.client.ts`. Construct an injected Web SDK only in browser code; do not
import an SDK-constructing module during server rendering. The configured owned
path keeps binding/SSR neutral. Init and the bound root reuse the chosen instance;
ownership mode cannot switch after startup. This provisions the same singleton
SDK for that activation; the application owns its destruction. Web browser state
uses shared module signals, so SDK instances are not independent state containers.
A fresh owned activation after complete teardown remains supported. Managed Kit loading and adoption remain separate future integration work.

### Kit server preparation

`bindSvelteKitServerExperiences` from `/kit/server` binds native `handleFetch`
and `handlePreparation` handlers. Keep this binding in an application server-only
module. Kit is an optional peer; portable root imports require neither Kit nor
Node. The server entry is blocked from client bundles and rejects visitor
preparation while Kit is building/prerendering.

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
    authorizeExperience: (_event, experience, { url }) =>
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
event intent, for your application. Candidate URL/context is supplied separately
from the native event; a direct endpoint event's own URL names the endpoint.
Server consent remains authoritative; browser input may narrow it. Identity
cookies do not grant consent. Configure `cookie` consistently with the browser
owner's path, domain, secure and same-site policy.

```ts
// src/hooks.server.ts — compose with any existing hooks.
import { request } from '$lib/server/experiences';
export const handleFetch = request.handleFetch;

// src/routes/_exo/primary/+server.ts
import { request } from '$lib/server/experiences';
export const POST = request.handlePreparation;
```

For an SSR-only supplied-plan composition, a universal loader can use Kit's
captured `event.fetch` directly. This low-level transport does not perform managed
browser adoption or replay; keep explicit event intent empty until that workflow
is available:

```ts
// src/routes/[...path]/+page.ts
import type { PageLoad } from './$types';
export const prerender = false;
export const load: PageLoad = async (event) => {
  const response = await event.fetch('/_exo/primary', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      operation: 'prepare', // 'read' performs an event-free content refresh.
      routeKey: event.url.pathname + event.url.search,
      experience: {
        destinationId: 'your-destination',
        path: event.url.pathname,
        personalization: { events: [] },
      },
    }),
  });
  if (!response.ok) throw new Error('Experience preparation unavailable.');
  return { result: await response.json() };
};
```

Authorize that explicit empty event intent in your server policy. Render the
returned `plan` through a supplied-plan renderer, with separate application
presentation for `notFound`, `contentError` and redirect values. The full managed
loader and browser consumption remain Phase 4 work.

The handlers own one request-local Node facade per operation and destroy it after
projection, including errors. Actual initial documents use the configured SSR or
hybrid policy. Direct preparation and Kit data/subrequests remain noncommitting;
`read` removes event intent. Incoming route URLs select configured Preview
capability; Preview transfers no visitor state/replay and changes no identity
cookie. Only ordinary initial SSR documents write or expire identity cookies,
using the final request profile and persistence consent. Preparation responses
and their containing document are private/no-store; coordinate the document
header with other application loaders to avoid duplicate writers.

Phase 3 provides server preparation and safe transport only. The universal
`request.loadExperience` helper, managed Kit source, request-result adoption and
navigation integration belong to Phase 4 and are not implemented. The existing
example has not migrated to this workflow. Keep visitor loading out of prerender;
static pages use separate public event-free fetching. Native missing-document
status policy can observe the projected primary result through
`request.onResult(event, result)` in the server configuration; apply HTTP status
after `resolve(event)` only to the matching successful HTML document, retaining
its body and headers. Do not throw speculative Kit errors from preparation. For example, add this
callback to the server configuration's `request` object and compose this native
handle with the fetch hook above:

```ts
// Inside request: { ... } in src/lib/server/experiences.ts
onResult(event, result) {
  if (event.route.id !== '/[...path]' || event.isDataRequest || event.isSubRequest ||
      !['GET', 'HEAD'].includes(event.request.method)) return;
  const routeKey = event.url.pathname + event.url.search;
  if (result.routeKey === routeKey) {
    event.locals.exoDocumentOutcome = { routeKey, notFound: result.notFound === true };
  }
},
```

```ts
// src/app.d.ts — merge into the application's existing App.Locals.
declare global {
  namespace App {
    interface Locals {
      exoDocumentOutcome?: { routeKey: string; notFound: boolean };
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
    outcome.notFound &&
    response.status === 200 &&
    response.headers.get('content-type')?.startsWith('text/html')
  ) {
    return new Response(response.body, {
      status: 404,
      statusText: 'Not Found',
      headers: response.headers,
    });
  }
  return response;
};
```

This preserves the captured result and application missing-page UI. It supplies
an HTTP404 document response; it does not select Kit's native `+error.svelte` or
change serialized `page.status`. Preview acquisition404 and empty success do not
select the missing-content outcome.

### Authoring

```ts
defineComponent<Props>(config); // Type-narrowing identity for component-type configs
defineExperienceTemplate<Props>(config); // Same shape, for coded Experience Template configs
```

### Fetching

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

Use `useLivePreview` when the app should subscribe to Preview Session updates,
resolve each payload, and render the resulting plan from `data`:

```svelte
<script lang="ts">
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
