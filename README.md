# Contentful Experiences SDK

> ⚠️ **Alpha.** Published to npm. APIs are unstable and will change.

A renderer SDK for Contentful's **Experience Orchestration (ExO)**. You bring a design system; the SDK takes the Experience payload from the Experience Delivery API (XDA) and renders it.

Install the adapter for your framework:

```sh
npm install @contentful/experiences-react     # React / Next.js
npm install @contentful/experiences-svelte    # Svelte / SvelteKit
npm install @contentful/experiences-angular   # Angular
```

That's the only adapter package you install for rendering. The adapter re-exports everything you need: resolver, types, renderer, design utilities, the Runtime-owned `EventBuilder`, and the experience delivery client. For server-side fetch, resolve, and event work without a renderer, install `@contentful/experiences-node`; its constructor takes runtime delivery configuration and owns the Delivery, optional Preview, and Optimization clients, while `forRequest()` binds request-local locale, resolve options, and volatile event profile/context. For browser fetch, resolve, and event work without a renderer, install `@contentful/experiences-web`; its constructor follows the same runtime-owned client model and it owns browser locale/context state plus a profile persisted in LocalStorage. Direct browser tokens are credentials, but are intentionally browser-visible when appropriately scoped and CORS-controlled; otherwise use an explicit trusted proxy host. The `@contentful/experiences-sdk-core`, `@contentful/experiences-design`, `@contentful/experiences-client`, and `@contentful/experiences-runtime` packages are workspace-internal implementation details. Apps that do not use a framework adapter can use `@contentful/experiences-live-preview` directly.

All three adapters share the same public-API shape: the same `Config`, the same `fetchExperience`, and the same styling model — design values are resolved on the server and auto-filled onto your components as ordinary props, which is the one recommended way to style them. The `useDesignValues`/`getDesignValues`/`injectDesignValues` accessor is an escape hatch for the cases props can't reach. The walkthrough below uses React. The [Svelte / SvelteKit](#svelte--sveltekit) and [Angular](#angular) sections show the same three steps in each, with the differences called out inline, and runnable apps for all three live in [`examples/`](#examples).

## Contents

- [Getting started](#getting-started-the-simple-path)
- [Live preview](#live-preview)
- [Event tracking](#event-tracking)
- [Styling components](#styling-components)
- [Design tokens](#design-tokens)
- [Advanced setup](#advanced-setup)
- [Error handling & troubleshooting](#error-handling--troubleshooting)
- [Svelte / SvelteKit](#svelte--sveltekit)
- [Angular](#angular)
- [Examples](#examples)
- [API reference](#api-reference)
- [Design system stays portable](#design-system-stays-portable)
- [Workspace internals](#workspace-internals)
- [Contributing](#contributing)
- [Support](#support)
- [License](#license)

---

## Getting started

Three steps: register your components, fetch and resolve, render. The minimal page is one `fetchExperience` call whose result goes straight into one `<ServerExperienceRenderer>`.

### 1. Register your components and (optional) experience templates

```tsx
// lib/experience-config.tsx
import {
  defineComponent,
  type Components,
  type Config,
  type ResolveToken,
  type ExperienceTemplates,
} from '@contentful/experiences-react';

import { Button } from './components/Button';
import { Heading, type HeadingProps } from './components/Heading';
import { Page } from './components/Page';

const components: Components = {
  // Keys match the segment after the last slash in `component.sys.urn`.
  // Example URN: crn:contentful:::experience:spaces/$self/environments/$self/components/Button
  //
  // Register a bare component for the common case…
  Button,
  // …or the config object when you need defaults / resolveData.
  Heading: defineComponent<HeadingProps>({
    defaults: { text: 'Untitled' },
    component: Heading,
  }),
};

const experienceTemplates: ExperienceTemplates = {
  // Optional. Keys match the last slash-segment of an `experienceTemplate` node's urn.
  page: Page,
};

// Optional. Resolves opaque design-token ids to their underlying values (see "Design tokens").
const resolveToken: ResolveToken = (token) => `var(--${token.value.replaceAll('.', '-')})`;

export const experienceConfig: Config = { components, experienceTemplates, resolveToken };
```

Components are registered by id and receive their **content** props together with their **resolved design** props (spacing, color, typography, layout) — the SDK resolves design server-side and auto-fills it onto the same props object. Styling from those props is the recommended path for every component; the `useDesignValues()` hook is an escape hatch for the cases props can't reach. Both are covered in [Styling components](#styling-components) below.

### 2. Fetch + resolve + render (server-side)

```tsx
// app/[slug]/page.tsx (Next.js App Router)
import { fetchExperience, ServerExperienceRenderer } from '@contentful/experiences-react';
import { experienceConfig } from '@/lib/experience-config';

export default async function ExperiencePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const experience = await fetchExperience(
    { spaceId: process.env.SPACE_ID!, environmentId: 'master', experienceId: slug },
    { accessToken: process.env.CDA_TOKEN! },
    { config: experienceConfig }
  );
  return <ServerExperienceRenderer experience={experience} config={experienceConfig} />;
}
```

One `fetchExperience` call fetches the payload from the Experience Delivery API and resolves it: the renderer walks the payload, resolves design properties to plain scalars, runs any `resolveData` hooks in parallel, and dispatches each node to your registered React component.

It throws `NotFoundError` when the id doesn't exist. See [Error handling](#fetchexperienceexperienceoptions-clientoptions-resolveoptions) in the API reference for routing that to your framework's 404.

The signature is three grouped params: what to fetch (space, env, experience), how to fetch (auth), and how to resolve (component config plus per-render `metadata` and a `debug` switch). Each group evolves on its own, so future personalization params, digital-property identifiers, and transport options fit their respective group without reshaping the signature.

**You pass render context once, to `fetchExperience`.** `metadata` and `debug` ride along on the returned plan, so the renderer reads them from there — no second copy to keep in sync. The renderer accepts both as props too, but only as overrides.

`config` is the one thing both calls need. It holds your component references, and those cannot travel on the plan: the plan is plain serializable data so it can cross a server/client boundary (React Server Components, SvelteKit's `data`, Angular's `TransferState`), and functions do not survive that trip. So `config` stays a prop, deliberately.

A working version is at [`examples/nextjs/app/[slug]/page.tsx`](./examples/nextjs/app/[slug]/page.tsx).

---

## Live preview

The adapters can subscribe to a Contentful Preview Session and keep the rendered plan in sync with edits. Pass the Preview Session options, initial data, and resolver config to the combined hook:

```tsx
import { useLivePreview } from '@contentful/experiences-react';

const livePreview = useLivePreview({
  previewSessionOptions: {
    spaceId,
    environmentId,
    previewToken,
    sessionId,
  },
  initialPayload,
  initialPlan,
  resolveOptions: { config: experienceConfig },
});

<ClientExperienceRenderer experience={livePreview.data} config={experienceConfig} />;
```

`livePreview.data` is the current `PortableRenderPlan`. The hook keeps the initial or last valid plan while a Preview Session update is received and resolved. `livePreview.error` contains an error when the live-preview connection fails, while the last valid data remains available. Svelte exposes the same `useLivePreview` API through a getter. Angular exposes `injectLivePreview`, also through a getter.

Use `useLivePreviewExperience` and `useExperiencePlan` separately when the app needs the raw Experience payload. For framework-neutral code, use `createLivePreviewClient` from `@contentful/experiences-live-preview`.

A connection starts only when both `previewToken` and `sessionId` are available.

Live Preview does not trigger or suppress analytics automatically. A manually
invoked event method still sends while a direct CPA preview fetch or Preview
Session is active.

---

## Event tracking

The public Node and Web SDKs expose `identify`, `page`, and `track` through the
Personalization API. `trackView`, `trackClick`, `trackHover`, and `trackFlagView`
use the Analytics API. Web supports one live Experiences Web SDK instance per
JavaScript runtime; call `destroy()` before constructing a replacement. Node
instances do not share that lock. Experiences Web and Optimization Web are
alternative SDKs and are not supported together on one page.

Runtime constructors take Delivery and optional Preview configuration and own
their clients. A token may be a value or supplier. A tokenless trusted proxy
requires an explicit `host` and must authenticate upstream. Node event methods
belong to a `forRequest()` facade, whose locale, profile, and context are
request-local. Web owns mutable locale and browser context, persists its current
profile in LocalStorage, and offers `reset()` for logout or a new visitor
session.

Web exposes current values and subscriptions through `states`, including
`profile`, `locale`, `consent`, `persistenceConsent`, `experienceRequestState`,
`eventStream`, and `blockedEventStream`. Read `states.profile.current` or subscribe
to changes with `states.profile.subscribe(...)`; dispose the returned handle
with `unsubscribe()` during application cleanup. See the [Web state and
subscriptions reference](./packages/web/README.md#state-and-subscriptions) for
snapshot, event publication, and lifecycle semantics. Node's profile remains request-local.

Ordinary online Personalization calls send directly. Web accepts ordinary
offline calls into an in-memory queue; a new offline call is refused when the
queue is full rather than evicting accepted work. Analytics remains direct.
`destroy()` makes one best-effort attempt to drain queued batches in order, but
queued work is not durable and does not provide exactly-once delivery. Event and persistence consent are
gated by the SDK: `consent()` on Web and `consent` per request on Node. Until event
consent is granted only `allowedEventTypes` are sent, and the application decides
when to grant consent. Web's
automatic interaction tracking sends views, hovers, and clicks through its direct
Analytics methods (see the [Web SDK README](./packages/web/README.md#interaction-tracking));
no framework adapter stamps tracked attributes yet. Manually invoked methods
still send during direct CPA preview or Live Preview.

An ordinary event call does not wait for every queued handoff. If a later call
needs a profile produced by `identify`, `page`, or `track`, await the earlier
call. Browser event context can include URL, query, referrer, title, dimensions,
and User-Agent; use context providers to redact those values before an event is
built or sent.

Node and Web expose `interceptors.event` to transform admitted direct events and
caller-built XDA events before destination validation and a final check of current
consent against the transformed event type. Invalid output fails schema validation;
a valid consent-blocked transformed event is reported with its final method/type.
Personalization and `trackView` refusals return `{ accepted: false }`; other
Analytics methods keep their void contracts. Each explicit submission runs its
chain once. XDA event chains may run concurrently while preserving array order;
prepared events run sequentially. Retries and browser prepared replay reuse the
evaluated events without rerunning hooks. See the [Node interceptor reference](./packages/node/README.md#event-interceptors)
and [Web interceptor reference](./packages/web/README.md#interceptors).

### Committed server rendering and state-only hydration

For server-rendered personalized content, use the supported committed-server
sequence below. It is separate from Personalization preparation/replay and does
not provide noncommitting XDA content selection.

1. Bind a Node request to explicit consent, permitted identity, locale, and event
   context. Await one direct `request.page()` and require both its accepted result
   and an API-issued `request.profile` before identity-dependent content fetching.
2. If identification is requested, build one identify event for the cycle and
   include it in each distinct sequential XDA fetch. Do not also send it directly
   or attach the already-sent page to those fetches. Fetch each distinct Experience
   once and reuse its plan for repeated presentations. Profile-only XDA selection
   currently does not reliably apply audience membership.
3. After the final fetch, produce a state-only handoff from the final
   `request.profile`, render the plans with attribution, and safely serialize the
   minimal public configuration and handoff into a private, no-store response.
4. Construct Web with automatic interactions disabled and profile/consent defaults
   omitted. Subscribe, await state hydration, then enable automatic tracking and
   register manual elements. Initial activation sends no page and refetches no
   content.

```ts
import { createRequestHandoffFromData } from '@contentful/experiences-node';

// Inside a request handler; experiences is the process-long Node SDK.
const request = experiences.forRequest({
  profile: permittedProfile,
  consent: visitorConsent,
  locale: requestLocale,
  eventContext: { page: pageProperties, userAgent },
});
const pageResult = await request.page({ properties: pageProperties });
if (!pageResult.accepted || !request.profile) {
  throw new Error('Page initialization did not establish a profile');
}
const identify = userId
  ? request.eventBuilder.buildIdentify({
      userId,
      traits: { identified: true },
    })
  : undefined;
const plans = [];
for (const experienceId of distinctExperienceIds) {
  plans.push(
    await request.fetchExperience(
      { experienceId, personalization: { events: identify ? [identify] : [] } },
      { config: experienceConfig }
    )
  );
}
const handoff = createRequestHandoffFromData({
  spaceId,
  environmentId,
  data: { profile: request.profile },
});
```

Node's `request.eventBuilder` applies request page URL/path/query/referrer, user
agent, and locale before building Personalization events. Explicit event inputs
override request context. The shared `experiences.eventBuilder` remains unbound;
fetching does not merge request context into already-built `personalization.events`.
Use the request builder rather than shared interceptor closures for visitor data.
Building sends nothing and invokes no hooks. Each identify-bearing fetch is a
separate event submission; this flow adds no duplicate-delivery guarantee.

The public Node producer accepts optional profile data and optional
`cache: { scope: 'private-request' }` (the default). It validates the explicit
space/environment scope and profile, accepts an ID-only profile, and packages no
replay or top-level continuation ID. An absent profile omits `state` and preserves
an existing browser profile on hydration. It performs no events or network work.
The internal Runtime helper of the same name takes `{ handoff, data? }` and
retains its separate replay-preserving behavior.

```ts
// In client-side lifecycle code, after safely reading the serialized handoff:
const web = new WebContentfulExperiences({
  spaceId,
  environmentId,
  delivery: publicDelivery,
  autoTrackEntryInteraction: { views: false, hovers: false, clicks: false },
});
const subscription = web.states.profile.subscribe(renderProfile);
await web.hydrateHandoffState(handoff, {
  routeKey: window.location.pathname + window.location.search,
});
web.tracking.enable('views');
web.tracking.enable('hovers');
web.tracking.enable('clicks');
// Register any manual elements now, using actual plan attribution.
// During application cleanup: subscription.unsubscribe(); web.destroy();
```

Here `WebContentfulExperiences` is the `ContentfulExperiences` export from
`@contentful/experiences-web`. Disabled automatic flags are not a global pause:
discovery starts at construction. Initial HTML must have no positive
`data-ctfl-track-views`, `data-ctfl-track-hovers`, or `data-ctfl-track-clicks`
opt-ins, and manual registration must wait until hydration completes. State-only
hydration does not mark the route tracked; ordinary `page()` remains direct.
Use the same direct page/profile step on later navigation or reset before fetching
content. An identify action joins pending initialization and explicitly refetches
without an unrelated page; a separate custom action uses `track()`.

On reset, invalidate stale application render work and remove or replace old
attributed content synchronously in the same transition, before awaiting the new
page/fetch cycle. SDK reset clears measurements and manual overrides, then resumes
eligible discovery immediately. Register replacement manual elements after
insertion; during ordinary navigation, let removed occurrences finalize before
clearing their manual registrations. Dispose subscriptions in application cleanup.
Safe serialization and preflight limitations are described below.

### Paired server-to-browser replay

A Node request facade can prepare one ordered `identify`/`track` prefix plus a
final `page` with `prepareRequestHandoff()`. It builds the events once and sends
one Personalization API request with `preflight: true`, which evaluates the
batch without committing it on Node. The result contains the exact evaluated replay and,
on success, preview data. Hook/schema failures or an invalid/blocked final page
produce an event-free handoff; blocked optional prefix events are omitted.
A preview transport failure retains the evaluated replay so the
application can choose a fallback. Ordinary Node event methods remain direct
and are not staged into this batch.

```ts
import { ContentfulExperiences as NodeContentfulExperiences } from '@contentful/experiences-node';

// Construct once for this server runtime; supply the token for your environment.
const experiences = new NodeContentfulExperiences({
  spaceId: 'your-space-id',
  environmentId: 'master',
  delivery: { accessToken: process.env.CONTENTFUL_DELIVERY_TOKEN! },
});

// In a request handler, bind request-local state and prepare one route:
const request = experiences.forRequest({
  locale: 'en-US',
});
const routeKey = '/products?category=chairs';
const { handoff, data } = await request.prepareRequestHandoff({
  routeKey,
  initialEvents: [{ type: 'track', event: 'experience_rendered' }],
  page: { properties: { title: 'Chairs' } },
});
// Serialize the handoff into this visitor's private, no-store response.
```

The application supplies a route key made from the visible pathname and search
string. It must begin with `/`. A handoff with profile, continuation identity,
or replay uses `cache: { scope: 'private-request' }`. A profileless public or
static handoff can carry state without event replay; a public permutation
requires an application-owned key covering every dimension that changes the
rendered Experience. The handoff parser checks these metadata rules but does
not set HTTP cache headers or certify the rest of a response.

On the browser, call `hydrateAndTrackCurrentPage()` on an existing Web instance.
Construction does not replay events. A matching replay is validated and
admitted as one batch; the promise settles on **admission**, before HTTP
completes. Repeated calls for the current handoff and route join that work.
A different handoff or a later visit can track again. A route mismatch skips
its evaluated state and replay, then follows ordinary current-page tracking.
A rejected prepared batch (including invalid events or insufficient capacity)
quietly falls back to one ordinary `trackCurrentPage()` attempt using the supplied
`buildPayload`, or the default page payload. The operation returns that attempt's
result and respects route deduplication, capacity, and lifecycle guards. An
accepted replay never falls back because of a later HTTP failure.

```ts
// Browser runtime, after reading the handoff from that response:
import {
  ContentfulExperiences as WebContentfulExperiences,
  type ExperiencesHandoff,
} from '@contentful/experiences-web';

const web = new WebContentfulExperiences({
  spaceId: 'your-space-id',
  environmentId: 'master',
  delivery: { host: 'https://application.example/experience-proxy' },
});

async function applyHandoff(handoff: ExperiencesHandoff) {
  const routeKey = window.location.pathname + window.location.search;
  const result = await web.hydrateAndTrackCurrentPage(handoff, { routeKey });
  return result; // accepted means admitted, not delivered
}
```

Event-only handoff preparation and hydration need no component registry. When
the same SDK fetches or resolves an Experience plan, pass that Experience's
registration config in the call's resolve options, for example
`web.fetchExperience({ experienceId }, { config: experienceConfig })`. Separate
calls may use different configs on the same SDK instance.

`hydrateHandoffState(handoff, { routeKey })` can seed state before tracking and
joins a later paired call for the same current initialization.
`trackCurrentPage({ routeKey, buildPayload })` handles ordinary navigation;
its callback receives `isInitialEmission`. Manual `page()` remains direct and
is not deduplicated. At the beginning of a still-current initialization, the
active browser profile or an already adopted continuation takes precedence over
the incoming handoff ID. Selection and publication happen atomically. An
initialization superseded before it begins adopts nothing; once published, its
continuation is retained across navigation. Supersession still cancels pending
hydration/replay and does not withdraw accepted queued work. Reset/destroy and
legitimate profile updates retain their existing behavior. Before the
Personalization response finishes, the adopted ID can attribute events without
being stored as a synthetic profile. Concurrent `fetchExperience()` calls join
identity initialization without waiting for replay HTTP; evaluated profile-state
hydration remains distinct from the captured replay target.

Handoffs containing event bodies are browser-visible private data. Escape JSON
for the HTML context used by your framework, send it only in a private,
`Cache-Control: private, no-store` response, and exclude secrets and server-only
traits. Do not put handoffs in shared caches, logs, or persistent storage. A
plain `JSON.stringify` result inserted unescaped into a `<script>` element is
not an HTML-safe serializer. A `PortableRenderPlan` can also contain diagnostic
values that JSON does not preserve; applications transporting a plan should
check their own round trip. The SDK does not install response headers or supply
a framework serializer.

Prepared batches stay in Web's in-memory queue on transport failure and retry
with their original event IDs, target identity, and locale. A request may have
committed before a failure becomes visible, so retries do not guarantee
exactly-once delivery. Web queues Analytics calls separately in memory; there is no mixed
Personalization/Analytics replay journal or global ordinary-event barrier.
No adapter or example currently wires this flow, and Live Preview remains
independent.

The current XDA client has no noncommitting preflight option. A separate
Personalization preflight does **not** make an XDA fetch render content with
those uncommitted mutations. An ordinary event-bearing XDA fetch still uses its
current POST contract and may commit the events; independently using both
operations can duplicate them. This SDK adds no interim suppression or fake
XDA content preview. Typed XDA preflight and a content-and-handoff operation
will be integrated after upstream support is available, before public release.

---

## Styling components

**There is one recommended way to style a component: read your design values off props.** Design values are resolved while building the plan, inside `fetchExperience` / `resolveExperience`, and auto-filled onto your component's props alongside content. Each design property lands on a prop of the same key, so a design property named `backgroundColor` arrives as a prop named `backgroundColor`, with any [design tokens](#design-tokens) resolved. Declare the design properties your component consumes, read them by name, and style from them:

```tsx
// components/Heading.tsx
'use client';
import type { CSSProperties } from 'react';

interface HeadingProps {
  text?: string;
  // Resolved design values, auto-filled as props:
  as?: 'h1' | 'h2' | 'h3'; // semantic key
  fontSize?: string;
  fontWeight?: string;
}

export function Heading({ text, as = 'h2', fontSize, fontWeight }: HeadingProps) {
  const Tag = as; // semantic key, read by name
  const style: CSSProperties = { fontSize, fontWeight };
  return <Tag style={style}>{text}</Tag>;
}
```

Both real CSS-shaped values (`fontSize`, `backgroundColor`) and author-defined semantic values (`variant`, `as`, `ratio`) arrive the same way. Read the semantic ones by name and pass the CSS-shaped ones into your `style`.

That one path covers everything the SDK supports:

- **CSS-shaped values** (`fontSize`, `backgroundColor`) — pass straight into `style`. No conversion step, no casts.
- **Semantic values** (`variant`, `as`, `ratio`, `target`) — read by name and map them to whatever markup or CSS you want. A design property name doesn't have to match a CSS property name.
- **Design tokens** — [`resolveToken`](#design-tokens) turns a token id into a value before it reaches the prop. An unresolved token remains a raw envelope and produces a diagnostic.

The SDK does not select responsive values at runtime. Use CSS media queries for responsive styling, or your own `matchMedia` integration for non-CSS behavior.

Everything else in this section is a helper for a specific case, not an alternative default. If you're reaching for one, check that props genuinely don't cover what you need.

### Interop with Tailwind, CSS-in-JS, and CSS custom properties

These plug in through `resolveToken` and props rather than through a separate styling path. `resolveToken` decides what a token id turns into, so return whatever your system consumes — a `var(--…)` reference, a value read out of your resolved Tailwind theme, an entry from a tokens package — and the component receives it as an ordinary prop value. From there, passing it into a `style` object, a `styled` interpolation, or a `clsx` call is your code's choice, and the SDK is indifferent to which. See the three worked `resolveToken` shapes under [Design tokens](#design-tokens).

The SDK does not generate a stylesheet or emit class names for your components. Class-based and CSS-in-JS systems are supported as **consumers of resolved values**, which is what `resolveToken` plus props gives you.

### Escape hatch: the design hook

`useDesignValues()` reads the same resolved design record from context. It exists for two cases props can't cover:

1. **A nested presentational child that isn't a registered component.** The SDK has no props to auto-fill onto it, so reading the nearest registered ancestor's design off context is the only way to reach it without threading props down by hand.
2. **Code that needs design outside the render path** — a `useEffect`, an imperative measurement.

Prefer props everywhere else. A registered component styling itself through the hook is doing extra work for no gain: it loses the typed prop surface and gains a context read.

```tsx
'use client';
import { toCss, useDesignValues } from '@contentful/experiences-react';

// Not registered with the SDK, so it gets no auto-filled props of its own.
function Badge({ label }: { label: string }) {
  const design = useDesignValues<{ color?: string }>(); // typed like useState<T>()
  return <span style={{ color: design.color }}>{label}</span>;
}
```

- `useDesignValues<T>()` takes an optional type argument for editor ergonomics. It's an assertion rather than a runtime check, so treat keys as possibly `undefined`.
- It returns the same values that auto-fill props, and returns `{}` outside a renderer, so components degrade gracefully in isolation.
- `toCss(design, { include, exclude })` converts a design record to a `CSSProperties` object, keeping only keys that map to a real CSS property and dropping semantic ones. It accepts optional key filters. It's a companion to the hook — with props you read the keys you declared, so there's nothing to filter.
- If `toCss` doesn't recognize a value, the property whitelist is extensible. See [`packages/design`](./packages/design).

Svelte and Angular follow the same contract, with the same escape hatch under a different name: `getDesignValues()` and `injectDesignValues()`. See [Svelte / SvelteKit](#svelte--sveltekit) and [Angular](#angular).

## Design tokens

When a design property's value is an ExO **design token** rather than a literal, XDA delivers it as `{ type: 'DesignToken', value: '<token-id>' }`. The id is just an opaque reference. The actual value lives in your design system, and only you know how to look it up, so `resolveToken` is where you turn that reference into its underlying value before it reaches a component:

```ts
const resolveToken: ResolveToken = (token) => designTokens[token.value];

export const experienceConfig: Config = { components, resolveToken };
```

The id shape is yours (dotted, slashed, flat, whatever your DTCG export emits). The SDK never interprets it; it passes you `token.value` and uses whatever you return. `resolveToken` looks the id up wherever you keep your tokens:

```ts
// 1. CSS custom properties. No JS cost, and the browser handles theme swaps.
resolveToken: (token) => `var(--${token.value.replaceAll('.', '-')})`;

// 2. A tokens object or DTCG package.
resolveToken: (token) => designTokens[token.value];

// 3. Tailwind. Walk the resolved theme by id path.
resolveToken: (token) => token.value.split('.').reduce((o, k) => o?.[k], tw.theme);
```

Returning `undefined` means "not resolvable": the SDK retains the raw token in the design record and reports a diagnostic. With no `resolveToken` configured, tokens likewise reach the component unresolved and the SDK reports the missing mapping.

---

## Advanced setup

When the simple path isn't enough, a few optional features cover most production needs. Per-page `metadata` flows into resolvers. `debug` mode surfaces what the SDK saw (visible missing-component boxes, verbose logs, a JSON dump panel). Async `resolveData` enriches props from external sources. Use any combination of them.

A full working route is at [`examples/nextjs/app/[slug]/page.tsx`](./examples/nextjs/app/[slug]/page.tsx). Visit `/<id>?debug=true&locale=en-US` after running the example.

```tsx
// app/[slug]/page.tsx
import { fetchExperience, ServerExperienceRenderer } from '@contentful/experiences-react';

import { experienceConfig } from '@/lib/experience-config';

export default async function ExperiencePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug: experienceId } = await params;
  const sp = await searchParams;
  const previewMode = sp.preview === 'true';
  const debug = sp.debug === 'true';
  const locale = (sp.locale as string) ?? 'en-US';

  // Per-page metadata flows into every resolveData hook; debug is the
  //    single observability switch (logs + missing-component box + JSON dump).
  //    Note: `debug` (render/observability) is independent of `preview`
  //    (which token + host to fetch from).
  const experience = await fetchExperience(
    { spaceId: process.env.SPACE_ID!, environmentId: 'master', experienceId, locale },
    {
      accessToken: process.env.CDA_TOKEN!,
      previewToken: process.env.CPA_TOKEN,
      preview: previewMode,
    },
    {
      config: experienceConfig,
      metadata: { slug: experienceId, locale },
      debug,
    }
  );

  return (
    <ServerExperienceRenderer
      experience={experience}
      config={experienceConfig}
      metadata={{ slug: experienceId, locale }}
      debug={debug}
    />
  );
}
```

### Async `resolveData` with external fetch

Each `defineComponent` entry can declare an async `resolveData` that derives final props from external sources. The SDK fans these out across all nodes with `Promise.all`, so a slow resolver doesn't block its peers.

When does it run? Once per page render, inside `resolveExperience(payload, config, opts?)`, before the renderer mounts. By the time `<ServerExperienceRenderer>` walks the tree, every `resolveData` has settled and its return value is sitting on `node.props.resolved`. Resolvers do **not** re-run when renderer props change or on client-side navigation. To re-fetch, call `resolveExperience` again, typically on a fresh server request.

```tsx
Button: defineComponent<ButtonProps>({
  resolveData: async ({ content, experience }) => {
    const { formattedLabel } = await fetchEnrichment(content.label as string);
    return {
      label: formattedLabel,
      url: `/${experience.metadata.locale}/${experience.metadata.slug}`,
    };
  },
  component: Button,
}),
```

`experience.metadata` here is exactly what the page passed into `resolveExperience`'s third argument. That's how per-page metadata reaches every resolver.

### Debug mode

`debug: true` is the single observability switch, threaded end-to-end from `fetchExperience` through resolve and render. Turning it on:

- **Logs** the fetch (host, ids), the raw payload, the resolution steps, and per-node `resolveData` timings under the `[experiences:debug]` prefix.
- **Shows the missing-component box** — `MissingComponent` renders a visible box naming the unregistered `componentId` (silent `null` when debug is off).
- **Auto-mounts `<DebugExperience>`** above the tree — a collapsible panel dumping the resolved plan as pretty JSON, so you can see exactly what the SDK interpreted.

Wire it to any signal you like — a `?debug=true` query param in development, a feature flag, `process.env.NODE_ENV !== 'production'`. It's independent of `preview` (which selects the delivery vs. preview token and host); debug is purely a render/observability concern.

```tsx
const debug = sp.debug === 'true';

const experience = await fetchExperience(fetchOpts, clientOpts, {
  config: experienceConfig,
  metadata: { slug, locale },
  debug, // logs + missing-component box + JSON dump panel
});

// The renderer takes the same top-level `debug` (auto-mounts <DebugExperience>):
<ServerExperienceRenderer experience={experience} config={experienceConfig} debug={debug} />;
```

Read it inside a component with `useExperience().debug` (React) / `getExperience().debug` (Svelte) to add your own debug affordances.

#### `<DebugExperience>`

The JSON-dump panel auto-mounts when `debug` is on, but you can also mount it manually anywhere — pass the resolved plan and, optionally, `defaultOpen`:

```tsx
import { DebugExperience } from '@contentful/experiences-react';

<DebugExperience experience={experience} defaultOpen />;
```

It renders a native `<details>` (collapses without extra JS) with a circular-reference-safe JSON serialization of the plan. v1 is the JSON dump; it has room to grow into a node-tree explorer and a `resolveData` timing panel.

### Custom fallback for unregistered components (`renderUnknown`)

When the payload references a component type that isn't in your `Config`, the renderer falls back to `MissingComponent` (a visible box when `debug` is on, silent `null` otherwise). Override it per-render with the `renderUnknown` prop on either renderer to ship your own fallback — a branded placeholder, an error boundary, a logging shim:

```tsx
import type { MissingComponentProps } from '@contentful/experiences-react';

function Fallback({ componentId, nodeId }: MissingComponentProps) {
  return (
    <div data-unregistered={componentId}>
      Unregistered component “{componentId}”{nodeId ? ` (#${nodeId})` : ''}.
    </div>
  );
}

<ServerExperienceRenderer
  experience={experience}
  config={experienceConfig}
  renderUnknown={Fallback}
/>;
```

`renderUnknown` receives `{ componentId, nodeId? }`. It renders unconditionally (your override, not the SDK, decides whether to gate on `debug` via `useExperience().debug`). The Svelte adapter takes the same prop with a Svelte component.

---

## Error handling & troubleshooting

Every non-happy-path — a malformed payload, a throwing `resolveData`, an unresolved design token, an unregistered id, and (the big one) **a registered component that throws while rendering** — degrades instead of crashing the page, and is reported as a plain `Error` you can inspect.

### Two kinds of diagnostic

|                  | When it's knowable                                       | Where it lives                                                         | Failure modes                                                                                          |
| ---------------- | -------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Resolve-time** | Inside `resolveExperience()`, before any renderer mounts | `plan.diagnostics` (`Error[]`, always present, `[]` on the happy path) | malformed payload, malformed slot, unidentifiable node, `resolveData` failure, unresolved design token |
| **Render-time**  | Per-framework, per-render                                | Merged into `<DebugExperience>`'s `errors` prop by the renderer        | unregistered component, unregistered experience template, a component that threw while rendering       |

Each diagnostic is a plain `new Error(message)` — the message names the node/component/slot involved. When it wraps a real caught exception (a component that throws while rendering, or a `resolveData` that throws or rejects), `.cause` holds the original error, so the real stack trace stays reachable (`console.error(err)`, or `err.cause.stack`).

### Delivery diagnostics

Upstream field-resolution errors are separate from those local SDK diagnostics.
The optional `plan.deliveryDiagnostics` field contains
`readonly ExperienceDeliveryDiagnostic[]`, with only readonly string `fieldPath`
and `message` on each record. Core copies recognized entries from `payload.errors`
in order, omits `originalError` and unknown fields, and leaves the field absent
when none are recognized. Raw `resolveExperience`, free fetch functions, Node,
Web, and the framework adapters expose the same plan contract. Destination error
records can be broader than by-ID errors, so the projection is not exhaustive.

Keep rendering useful content when this field is present. A generic partial-content
warning and `plan.deliveryDiagnostics.length` are suitable visitor-facing signals;
inspect the typed fields explicitly when diagnosing a problem. Upstream strings
are untrusted and may contain private information: stripping other fields and
HTML escaping do not make them safe to disclose. Use normal text APIs for any
explicit presentation, avoid automatic logging/display of raw messages, and omit
diagnostics from public bootstrap/handoff payloads.

The adapters' automatic debug JSON dumps omit `deliveryDiagnostics` as well;
inspect that field explicitly through the typed plan when needed. Existing local
error lists and the rest of the debug output remain unchanged.

Absence does not establish personalization success or the absence of other
upstream errors. This field does not change `plan.diagnostics: Error[]`, 404 and
transport exceptions, profile adoption, or the Personalization request-state
observable. `ExperienceDeliveryDiagnostic` is re-exported from Node, Web, and the
React/Svelte/Angular adapters directly from its Core owner.

### Per-failure-mode behavior

| Failure                                                                        | Behavior                                                                                                           | Override point             |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| Malformed top-level payload (`nodes` not an array)                             | Warn, treat as `[]`, don't throw                                                                                   | —                          |
| Malformed slot shape (a hand-built `PortableRenderPlan` with a non-array slot) | Warn, treat that slot as `[]`                                                                                      | —                          |
| A payload node with no readable `component`/`experienceTemplate` ref           | Warn, drop that node + its subtree, siblings unaffected                                                            | —                          |
| `resolveData` throws (sync or async) or rejects                                | Warn, node renders without `props.resolved`, other nodes' resolvers unaffected                                     | —                          |
| A design token has no `resolveToken` mapping                                   | Warn, the **raw `DesignToken`** reaches the component instead of being dropped, in case it can make some use of it | `resolveToken` on `Config` |
| Component id not in `Config.components`                                        | Renders `MissingComponent` (visible box in debug, silent otherwise)                                                | `renderUnknown`            |
| Experience Template id not in `Config.experienceTemplates`                     | Warn, renders the template's slot children unwrapped (content survives)                                            | —                          |
| **A registered component throws while rendering**                              | Isolated per-node; siblings render normally. Renders `ComponentError` (visible box in debug, silent otherwise)     | `renderError`              |

### `renderError` — custom fallback for a component that throws

Sibling of `renderUnknown`, same shape, different failure mode:

```tsx
import type { ComponentErrorProps } from '@contentful/experiences-react';

function Fallback({ componentId, nodeId, message }: ComponentErrorProps) {
  return (
    <div data-render-error={componentId}>
      “{componentId}”{nodeId ? ` (#${nodeId})` : ''} failed to render{message ? `: ${message}` : ''}
      .
    </div>
  );
}

<ServerExperienceRenderer
  experience={experience}
  config={experienceConfig}
  renderError={Fallback}
/>;
```

The Svelte and Angular adapters take the same prop with their own component shape (`ComponentErrorProps` / `cf-component-error`'s inputs are `componentId`, `nodeId?`, `message?`).

### `<DebugExperience>` and errors

When there's anything to report, `<DebugExperience>` renders a plain list of each diagnostic's `message` above the JSON dump, so errors are visible in the debug surface, not console-only.

Pass `errors` explicitly if you're mounting `<DebugExperience>` yourself instead of relying on the renderer's auto-mount:

```tsx
<DebugExperience experience={plan} errors={[...plan.diagnostics, ...myRenderTimeDiagnostics]} />
```

### SSR/CSR differences for `component-render-error`

Unlike every other diagnostic, `component-render-error` can only be discovered by actually rendering the component — and each framework's server renderer handles that failure differently:

| Framework   | SSR behavior                                                                                                                                                                                  | CSR behavior                                             | Diagnostic recorded during SSR?           |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------- |
| **React**   | Degrades gracefully — an internal `<Suspense>` boundary emits the `renderError` fallback under both the legacy and streaming renderers (streaming defers the real retry to client hydration). | Catches via the standard class error-boundary mechanism. | No — only fires once the client executes. |
| **Svelte**  | No recovery — `<svelte:boundary>` doesn't run its catching machinery server-side; a throw during the server walk fails the entire render.                                                     | Catches normally.                                        | No — SSR never reaches the catching code. |
| **Angular** | Catches identically to CSR — there's no separate server renderer, so SSR and CSR run through the exact same component-creation path.                                                          | Same code path as SSR.                                   | Yes, for a creation-time throw.           |

**Practical implications:**

- **React** (Next.js App Router, Remix streaming, or any Suspense-aware pipeline): a throwing component degrades gracefully server-side, but the diagnostic itself only shows up after hydration — check `<DebugExperience>` again on the client if you need it during SSR.
- **Svelte/SvelteKit**: a throwing component fails the whole page server-side. Add a [`handleError` hook](https://svelte.dev/docs/kit/hooks#Shared-hooks-handleError) in `src/hooks.server.ts` to turn that into a controlled error response instead of a raw crash — it won't give you per-node isolation, but it's the difference between a blank 500 and one you control. Test your components' unhappy paths before shipping; don't rely on SSR to catch a bad one for you.
- **Angular** gives the strongest guarantee here: a component that throws during creation is isolated identically whether you're rendering server- or client-side.
- None of the three frameworks catch a throw during a _later_ re-render with full parity — see below.

### Known gap: a throw after the initial render

- **React / Svelte**: caught the same way as a creation-time throw — no special handling needed.
- **Angular**: partially caught. A later throw from the adapter's own resolution step (e.g. a `resolveToken` that starts failing) swaps that node to the error fallback and recovers automatically once resolution succeeds again. A throw from inside the _customer_ component's own internals on a later change-detection pass (its own template expression, computed, or lifecycle hook) is **not** caught today — nothing in this adapter sits on that code path.

---

## Svelte / SvelteKit

`@contentful/experiences-svelte` is the Svelte 5 adapter. The public API matches React one for one: the same `Config`, `fetchExperience`, `resolveExperience`, `ServerExperienceRenderer`/`ClientExperienceRenderer`, design tokens, and `defineComponent`/`defineExperienceTemplate`. Three differences, all mechanical:

| Concern                    | React                                          | Svelte                                                                                                  |
| -------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Register a component       | `component:` takes a React component           | `component:` takes a Svelte component                                                                   |
| Read design (escape hatch) | `useDesignValues()`                            | `getDesignValues()` (read inside a `$derived`)                                                          |
| Runtime context            | `useExperience()` / `useContentfulComponent()` | `getExperience()` / `getContentfulComponent()`                                                          |
| Slots                      | each slot is a named React-node prop           | default slot is a `children` Snippet; others via `getContentfulComponent().slots` + `<NodesRenderer />` |

### 1. Register your components

```ts
// lib/experience-config.ts
import {
  defineComponent,
  type Components,
  type Config,
  type ResolveToken,
} from '@contentful/experiences-svelte';

import Button from './components/Button.svelte';
import Heading, { type HeadingProps } from './components/Heading.svelte';

const components: Components = {
  Button, // bare component…
  Heading: defineComponent<HeadingProps>({ defaults: { text: 'Untitled' }, component: Heading }),
};

const resolveToken: ResolveToken = (token) => designTokens[token.value];

export const experienceConfig: Config = { components, resolveToken };
```

### 2. Style a component from props

Resolved design auto-fills props here too, so a component styles itself straight from `$props()`:

```svelte
<!-- components/Heading.svelte -->
<script lang="ts">
  export interface HeadingProps {
    text?: string;
    as?: 'h1' | 'h2' | 'h3'; // resolved design, auto-filled as props
    fontSize?: string;
    fontWeight?: string;
  }

  let { text, as = 'h2', fontSize, fontWeight }: HeadingProps = $props();
</script>

<svelte:element this={as} style="font-size: {fontSize}; font-weight: {fontWeight};">{text}</svelte:element>
```

`getDesignValues()` is the [escape hatch](#escape-hatch-the-design-hook), for the same two cases as React — a nested child that isn't a registered component, or design needed outside the render path:

```svelte
<!-- escape hatch: a nested child that isn't registered, so it has no props of its own -->
<script lang="ts">
  import { getDesignValues } from '@contentful/experiences-svelte';

  let { label }: { label: string } = $props();

  const design = $derived(getDesignValues<{ color?: string }>());
</script>

<span style="color: {design.color};">{label}</span>
```

### 3. Fetch + render (SvelteKit)

```ts
// routes/[slug]/+page.server.ts
import { fetchExperience } from '@contentful/experiences-svelte';
import { CDA_TOKEN, SPACE_ID } from '$env/static/private';
import { experienceConfig } from '$lib/experience-config';

export const load = async ({ params }) => {
  const experience = await fetchExperience(
    { spaceId: SPACE_ID, environmentId: 'master', experienceId: params.slug },
    { accessToken: CDA_TOKEN },
    { config: experienceConfig }
  );
  return { experience };
};
```

```svelte
<!-- routes/[slug]/+page.svelte -->
<script lang="ts">
  import { ServerExperienceRenderer } from '@contentful/experiences-svelte';
  import { experienceConfig } from '$lib/experience-config';

  let { data } = $props();
</script>

<ServerExperienceRenderer experience={data.experience} config={experienceConfig} />
```

Everything else applies identically: advanced setup (preview, async `resolveData`), the API reference below, merge precedence, and design tokens. Substitute the Svelte spelling of each hook.

---

## Angular

`@contentful/experiences-angular` is the Angular adapter (peer range `^20 || ^21 || ^22`). Same `Config`, same `fetchExperience`, same `defineComponent`/`defineExperienceTemplate`, same design tokens. The differences follow from Angular having no prop spread and no lazy renderable-children primitive:

| Concern                    | React                                          | Angular                                                                                          |
| -------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Register a component       | `component:` takes a React component           | `component:` takes a standalone component class (`Type<unknown>`)                                |
| Read design (escape hatch) | `useDesignValues()`                            | `injectDesignValues()` — returns a `Signal`, read it inside a `computed()`                       |
| Runtime context            | `useExperience()` / `useContentfulComponent()` | `injectExperience()` / `injectContentfulComponent()`                                             |
| Renderers                  | `<ServerExperienceRenderer />`                 | `<cf-server-experience>` / `<cf-experience>`                                                     |
| Slots                      | each slot is a named React-node prop           | each slot is an `@Input()` holding `PortableRenderNode[]`, rendered with the exported `*cfNodes` |

Two Angular-only consequences worth knowing up front:

- **Only declared inputs are set.** The adapter filters merged props to the target component's declared inputs, because binding an input a component doesn't declare is an error. Keys a component doesn't declare are dropped rather than passed — they stay reachable through `injectDesignValues()`.
- **`*cfNodes` is load-bearing, not an escape hatch.** It is how you render a slot, because `projectableNodes` is positional and eager, which would break slot laziness. It is a structural directive, so it adds no element between your markup and the slot children.

### 1. Register your components

```ts
// lib/experience-config.ts
import {
  defineComponent,
  type Components,
  type Config,
  type ResolveToken,
} from '@contentful/experiences-angular';

import { ButtonComponent } from './components/button.component';
import { HeadingComponent, type HeadingProps } from './components/heading.component';

const components: Components = {
  Button: ButtonComponent, // bare class…
  Heading: defineComponent<HeadingProps>({
    defaults: { text: 'Untitled' },
    component: HeadingComponent,
  }),
};

const resolveToken: ResolveToken = (token) => designTokens[token.value];

export const experienceConfig: Config = { components, resolveToken };
```

### 2. Style a component

Resolved design auto-fills declared inputs here too, so the recommended path is the same: declare the design properties you consume as inputs and read them by name.

In Angular, declaring the input is also what makes the design property arrive at all — the renderer binds only inputs a component declares, because binding an undeclared input is an error. Undeclared keys stay reachable through `injectDesignValues()`.

```ts
// components/heading.component.ts
import { NgStyle } from '@angular/common';
import { Component, Input, computed, signal } from '@angular/core';

@Component({
  selector: 'app-heading',
  imports: [NgStyle],
  template: `<h2 [ngStyle]="style()">{{ textValue() }}</h2>`,
})
export class HeadingComponent {
  protected readonly textValue = signal<string | undefined>(undefined);
  protected readonly fontSizeValue = signal<string | undefined>(undefined);
  protected readonly fontWeightValue = signal<string | undefined>(undefined);

  // Setter takes the API name; the signal takes a distinct `…Value` name.
  @Input() set text(value: string | undefined) {
    this.textValue.set(value);
  }

  /** Design property. */
  @Input() set fontSize(value: string | undefined) {
    this.fontSizeValue.set(value);
  }

  /** Design property. */
  @Input() set fontWeight(value: string | undefined) {
    this.fontWeightValue.set(value);
  }

  protected readonly style = computed(() => ({
    fontSize: this.fontSizeValue(),
    fontWeight: this.fontWeightValue(),
  }));
}
```

`injectDesignValues()` is the [escape hatch](#escape-hatch-the-design-hook). It returns a `Signal`, so read it inside a `computed()`, and like every `inject()`-based API it must be called from an injection context.

Signal inputs (`input()`) are AOT-only, so the adapter's own components and these examples use decorator `@Input()` with a setter bridging into a signal. Your app is free to use `input()` if it always builds AOT.

### 3. Fetch + render (`@angular/ssr`)

Fetch on the server — in an Express handler rather than an Angular route resolver, since resolvers also run in the browser during client-side navigation and would ship your CDA token to the client:

```ts
// server.ts
import { fetchExperience } from '@contentful/experiences-angular';
import { experienceConfig } from './app/lib/experience-config';

const experience = await fetchExperience(
  { spaceId, environmentId: 'master', experienceId: slug },
  { accessToken: CDA_TOKEN },
  { config: experienceConfig }
);

// Hand it to the app as the requestContext argument of AngularNodeAppEngine.handle().
const response = await angularApp.handle(req, { experience });
```

```ts
// pages/experience-page.component.ts
@Component({
  imports: [ServerExperienceRendererComponent],
  template: `<cf-server-experience [experience]="experience" [config]="config" />`,
})
export class ExperiencePageComponent {
  protected readonly experience = inject(ExperienceStore).data?.experience ?? null;
  protected readonly config = experienceConfig;
}
```

`PortableRenderPlan` is plain JSON — component classes live in `experienceConfig`, never in the plan — so relaying it to the browser through `TransferState` for hydration works without special handling. See [`examples/angular`](./examples/angular) for the full wiring and [`packages/adapter-angular/README.md`](./packages/adapter-angular/README.md) for the complete API surface and parity table.

---

## Examples

Runnable apps for all three frameworks live in [`examples/`](./examples). They register the same components against the same Experience payload, so they render identically; only the framework-specific setup differs.

| Example                                      | Stack                       | Shows                                                                                          |
| -------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------- |
| [`examples/nextjs`](./examples/nextjs)       | Next.js 15 (App Router)     | Preview mode, async `resolveData`, design tokens, styling hooks                                |
| [`examples/sveltekit`](./examples/sveltekit) | SvelteKit 2 + Svelte 5      | 1:1 parity with the Next.js app                                                                |
| [`examples/angular`](./examples/angular)     | Angular 20 + `@angular/ssr` | Same, on zoneless Angular; fetch in Express (keeps tokens server-side) + `TransferState` relay |

Both examples render the same demo Experience. To run them you first seed that Experience into your Contentful space with the one-time bootstrap script — the script uses the experiences management API to provision the ContentType, entries, assets, design tokens, Components, Experience Template, DataAssemblies, and the Experience itself.

```sh
npm install --ignore-scripts
npm run build                          # build the SDK packages

# 1. Seed the demo Experience into your Contentful space (one-time).
cd examples/scripts
cp .env.example .env                   # fill in SPACE_ID, ENVIRONMENT_ID, CMA_TOKEN
npm run bootstrap                      # prints the experienceId at the end (default: `landing`)

# 2. Run one of the example apps against the seeded space.
cd ../nextjs                           # or ../sveltekit
cp .env.example .env.local             # sveltekit uses .env; fill in SPACE_ID, ENVIRONMENT_ID, CDA_TOKEN
npm run dev
```

Then visit `/landing` (or whichever experienceId the bootstrap printed). See each example's README for its file map and route-by-route walkthrough.

**Tokens.** `CMA_TOKEN` is a Personal Access Token that only the bootstrap script sees. `CDA_TOKEN` is a Content Delivery API token — this is what the running app uses at runtime. `CPA_TOKEN` is a Content Preview API token, only needed if you want to exercise `?preview=true`; see each example's README for details.

---

## API reference

### `fetchExperience(experienceOptions, clientOptions, resolveOptions)`

Async. Fetches an Experience from the Experience Delivery API and resolves it in one call, the same as fetching the payload yourself and then calling `resolveExperience`. Returns a `PortableRenderPlan`.

This is the established adapter/free-function API, not the Node/Web runtime
constructor contract. Its caller-supplied `{ client }` branch, `createClient`,
and direct `ContentfulViewDeliveryClient` use remain supported.

Three positional args map to three concerns that evolve independently:

| Arg                 | Type                                                                                            | Purpose                                                                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `experienceOptions` | `{ spaceId, environmentId, experienceId, locale?, parameters?, personalization?, extensions? }` | Which Experience to fetch, including first-class personalization and additional XDA extensions. Future digital-property identifiers widen this type.       |
| `clientOptions`     | `{ accessToken, previewToken?, preview?, host? }` **or** `{ client }`                           | How to fetch. Discriminated union: pass credentials inline (with optional preview toggle) or pass in your own `ContentfulViewDeliveryClient`.              |
| `resolveOptions`    | `{ config, metadata?, debug? }`                                                                 | How to resolve. `metadata` flows into every `resolveData` hook as `ctx.experience.metadata`; `debug` turns on logging + the visible missing-component box. |

Both `metadata` and `debug` are recorded on the returned plan, so the renderer picks them up without being passed them again.

Configure both tokens up front and flip `preview: true` per call to hit the preview API. `preview: true` without `previewToken` throws an error. `host` is a full base-URL string for custom endpoints (staging, proxy, per-region); when set, it wins over the `preview`-derived default host.

```ts
// Inline credentials, client created internally
const plan = await fetchExperience(
  { spaceId: '...', environmentId: 'master', experienceId: slug, locale: 'en-US' },
  {
    accessToken: process.env.CDA_TOKEN!,
    previewToken: process.env.CPA_TOKEN!,
    preview: true, // flip per request; omit or set false for delivery
  },
  { config: experienceConfig, metadata: { slug }, debug: true }
);

// Pre-created client, useful when you manage the client lifecycle yourself
import { createClient } from '@contentful/experiences-react';
const client = createClient({ accessToken: process.env.CDA_TOKEN! });
const plan = await fetchExperience(
  { spaceId, environmentId, experienceId },
  { client },
  { config: experienceConfig }
);
```

**Error handling.** The underlying delivery client throws `NotFoundError` (re-exported from the adapter) when the Experience ID doesn't exist, plus `UnauthorizedError`, `ForbiddenError`, and so on for other 4xx/5xx responses. An Experience with no published nodes is **not** a 404; it resolves to a valid `PortableRenderPlan` with `nodes: []` (draft, unpublished, or empty-locale content). Route the missing-experience case to your framework's 404 idiom:

```ts
try {
  const experience = await fetchExperience(/* … */);
  return <ServerExperienceRenderer experience={experience} config={config} />;
} catch (err) {
  if (err instanceof NotFoundError) notFound();
  throw err;
}
```

### Runtime Experience parameters

Pass `parameters` on a by-ID fetch to resolve content with caller-selected values.
The Experience declares accepted IDs in `Experience.parameters`; bindings read
`$parameters/<id>`. There is no separate `dynamic` flag. Delivery enforces names,
requiredness, fallbacks, and value validation; the SDK does not need the authored
Experience definition before fetching.

Values are strings, numbers, or one-level Records of strings/numbers. For example,
an Experience declaring the Record `featuredPosts` can bind a collection query to
`$parameters/featuredPosts`:

```ts
import { fetchExperience, type ExperienceParameters } from '@contentful/experiences-react';

const parameters = {
  featuredPosts: { limit: 6, order: '-fields.title' },
} satisfies ExperienceParameters;

const initialPlan = await fetchExperience(
  { spaceId, environmentId, experienceId, locale: 'en-US', parameters },
  { accessToken },
  { config: experienceConfig }
);
```

Collection `order` is **one signed, namespaced path**: `fields.<apiName>` or
`sys.<id>`, optionally prefixed with `-` for descending order. For example,
`fields.title`, `-fields.title`, `sys.createdAt`, or `-sys.createdAt`.
`ExperienceParameterOrder` describes that string shape; Delivery validates the
actual field and allowed values. Comma-separated paths, `title_ASC`, and the
internal binding `OrderTerm[]` format are not runtime order values.

Change the values and refetch the same Experience, then replace the renderer's
plan. Each fetch resolves the returned payload again, including `resolveData`.
For example, in a client React component with `initialPlan` supplied as a prop:

```tsx
import { useState } from 'react';
import {
  ExperienceRenderer,
  fetchExperience,
  type PortableRenderPlan,
} from '@contentful/experiences-react';

function FeaturedPosts({ initialPlan }: { initialPlan: PortableRenderPlan }) {
  const [plan, setPlan] = useState(initialPlan);

  async function showMore() {
    const nextPlan = await fetchExperience(
      {
        spaceId,
        environmentId,
        experienceId,
        parameters: { featuredPosts: { limit: 12, order: 'sys.createdAt' } },
      },
      { accessToken },
      { config: experienceConfig }
    );
    setPlan(nextPlan);
  }

  return (
    <>
      <button onClick={showMore}>Show 12, oldest first</button>
      <ExperienceRenderer experience={plan} config={experienceConfig} />
    </>
  );
}
```

Use a browser-appropriate token or a trusted proxy for browser fetches. Svelte and
Angular use the same fetch options and replace their renderer's plan input.
The types `ExperienceParameters`, `ExperienceParameterValue`,
`ExperienceParameterRecord`, and `ExperienceParameterOrder` are exported by every
framework adapter and the public Node/Web SDKs.

Node's request facade and Web's live instance take the same per-call option:

```ts
// Node: parameters belong to this fetch, not the process-long instance.
const plan = await request.fetchExperience(
  { experienceId, parameters: { featuredPosts: { limit: 6, order: '-fields.title' } } },
  { config: experienceConfig }
);

// Web: refetch and publish this new plan to your renderer.
const nextPlan = await experiences.fetchExperience(
  { experienceId, parameters: { featuredPosts: { limit: 12, order: 'sys.createdAt' } } },
  { config: experienceConfig }
);
```

GET encodes `parameter.<id>` and `parameter.<id>.<field>` query keys, for example
`?locale=en-US&parameter.featuredPosts.limit=6&parameter.featuredPosts.order=-fields.title`.
System options such as `locale` remain separate. An empty Record or a key containing dots needs POST to
preserve its shape or name for Delivery validation. Personalization or defined `extensions` also select POST,
whose body carries the structured, unprefixed map:

```json
{ "parameters": { "featuredPosts": { "limit": 6, "order": "-fields.title" } } }
```

Both transports use the generated Delivery client's authentication and rename
headers. Calls omitting `parameters` retain existing behavior. Delivery failures
retain their message and original error (including status/body) as
`ExperienceFetchError.cause`; `NotFoundError` still passes through unchanged.

Direct by-ID preview fetches accept the same option and transport encoding.
Preview can report missing/invalid values in the hydrated response's `errors`
instead of failing the fetch; recognized entries appear in
[`plan.deliveryDiagnostics`](#delivery-diagnostics). Preview Sessions continue to use their existing
**unprefixed** `context.parameters` map, such as `{ productId: 'foo123' }`;
the Session contract determines its supported values. The Contentful editor owns
Session context changes, and the SDK consumes the new hydrated snapshots through
HTTP and WebSocket updates. No client-side Session mutation API is added.

### Content source maps

Set `extensions.sourceMap` in `experienceOptions` to fetch the content source map alongside the experience. It lands on `plan.sourceMap`:

```ts
const plan = await fetchExperience(
  { spaceId, environmentId, experienceId: slug, extensions: { sourceMap: {} } },
  { accessToken: process.env.CDA_TOKEN! },
  { config: experienceConfig }
);

plan.sourceMap; // ExperienceSourceMap | undefined
```

The SDK selects the POST operation, extracts the returned source map, and forwards it to `resolveExperience`. Source maps also compose with the top-level `personalization` option in the same request.

Two things to know before switching it on:

- **The map is large.** It carries per-node field provenance for every entry, asset, and layer in the experience. That is why it is opt-in rather than always fetched, and why `plan.sourceMap` is `undefined` by default.
- **The request becomes a `POST`.** The source-map opt-in is a request-body field, and the delivery API only accepts a body on its `getWithOverrides` operation. Everything else — query parameters, tokens, headers, and the response shape — is identical, but a `POST` is not CDN-cacheable the way the plain `GET` is.

#### Attribution

When a plan carries a usable source map, the SDK resolves which reportable scopes each node belongs to: the Experience, and any persisted Fragment it sits in. Inline fragments are walked through and never reported. The result is plain serializable data:

- `plan.attribution.scopes` maps an opaque, plan-local occurrence key to a scope: `entityId`, `entityKind` (`'Experience'` or `'ExperienceFragment'`), `variantId`, and the optional `entityKindId`, `parentExperienceId`, `parentVariantId`, `optimizationId`, `variantIndex` and `entryIds`. `variantId` is the scope's selected variant, or `default` when no variant ID is available; unavailable optimization and variant-index fields are omitted. Fragments inside an Experience carry the root Experience's `parentExperienceId` and selected or `default` `parentVariantId`, including when nested in another Fragment. Experiences omit both parent fields. `entryIds` holds the entries bound by the nodes that scope directly contains, so a nested Fragment's entries stay off its Experience.
- `node.attribution` lists every scope the node belongs to (`scopes`, outer to inner), the ones it is a top-level node of (`roots`), and the entries its own content is bound to (`entryIds`).

Only nodes with an `id` get attribution; the SDK never generates ids. A map it cannot use (an unsupported `version`, or a malformed one) yields no attribution and never adds a diagnostic, so Live Preview keeps rendering. Each resolve rebuilds attribution from scratch, so a payload without a map clears it.

Live Preview plans carry attribution only if the preview-session endpoints return a source map, which the SDK does not request today.

#### Which map wins

`resolveExperience` reads the map from, in order: `options.sourceMap`, then `payload.extensions.sourceMap`, then none. `fetchExperience` uses the map on its own response, which is there only when the request opts in with `extensions: { sourceMap: {} }`. The runtime `resolveExperience(payload, { sourceMap })` accepts the same override.

`ExperienceSourceMap` types the scalar fields and leaves the collections as `unknown[]`: the SDK reads only the parts it needs for attribution, and the core package carries no dependency on the delivery client. When you need the full nested shape, narrow it:

```ts
import type { ContentfulViewDelivery } from '@contentful/experiences-react';

const map = plan.sourceMap as ContentfulViewDelivery.HydratedExperienceViewExtensionsSourceMap;
```

### `toExperiencePayload(response)` / `readSourceMap(response)`

Only needed if you drive the delivery client directly instead of going through `fetchExperience`.

The experience endpoint types its response as a union of the legacy and renamed entity shapes (`HydratedView | HydratedExperienceView`). In practice the alpha-feature header guarantees the renamed one, but TypeScript cannot know that, so a direct caller is left writing the cast by hand. `toExperiencePayload` does that narrowing once:

```ts
import {
  createClient,
  readSourceMap,
  resolveExperience,
  toExperiencePayload,
} from '@contentful/experiences-react';

const client = createClient({ accessToken: process.env.CDA_TOKEN! });
const response = await client.experience.get(spaceId, environmentId, slug, { locale: 'en-US' });

const plan = await resolveExperience(toExperiencePayload(response), experienceConfig, {
  sourceMap: readSourceMap(response),
});
```

Both are type-level only — no validation, no copying, no runtime cost. `readSourceMap` returns `undefined` when the response carries no map, which is what `resolveExperience` expects for "no source map".

### `createClient(options)`

Functional constructor over `ContentfulViewDeliveryClient` for the SDK's option shape. It maps `accessToken` to `token` and `host` to `baseUrl`, and passes everything else through. Prefer this over `new ContentfulViewDeliveryClient({...})` so field names stay consistent with `fetchExperience`'s inline-credentials path.

`createClient` is a **one-time setup** primitive: it builds a single client bound to a single token, and is best for cases where you're managing the client lifecycle yourself (custom caching, request middleware, sharing the instance across code paths). It does not participate in the per-request `preview` toggle.

> **If you need runtime-dynamic swaps between delivery and preview use `fetchExperience`'s inline-credentials path**. Pass `{ accessToken, previewToken, preview }` directly instead of pre-building a client and passing `{ client }`. The `preview` boolean is a per-call selector; a pre-built client is bound to whichever token it was constructed with and can't swap.

```ts
import { createClient } from '@contentful/experiences-react';

const client = createClient({
  accessToken: process.env.CDA_TOKEN!,
  host: 'https://preview-staging.example.com', // optional custom base URL
  // headers, timeoutInSeconds, maxRetries, fetch, logging, etc. all pass through
});
```

Every delivery request carries an alpha-feature header — see [The alpha-feature header](#the-alpha-feature-header).

### The alpha-feature header

The Experience Delivery API gates the entity shapes this SDK reads behind a header:

```
x-contentful-enable-alpha-feature: new-exo-entity-types
```

A payload fetched without it has a different shape that the SDK will not resolve. **You never send it yourself.** `@contentful/experience-delivery` sets it on every request as of `1.0.0-dev.7`, so every path is covered: `fetchExperience`, a client from `createClient`, and a raw `ContentfulViewDeliveryClient` you construct and call directly.

That means driving the raw client and resolving the payload yourself needs no header plumbing:

```ts
import { ContentfulViewDeliveryClient, resolveExperience } from '@contentful/experiences-react';

const client = new ContentfulViewDeliveryClient({ token: process.env.CDA_TOKEN! });

const payload = await client.experience.get(spaceId, environmentId, experienceId, { locale });

const plan = await resolveExperience(payload, experienceConfig);
```

To send a different alpha-feature set, pass it in the **per-request** `headers` — the delivery client re-applies its own default after client-level `headers`, so a `createClient({ headers })` entry for this key does not take effect:

```ts
await client.experience.get(
  spaceId,
  environmentId,
  experienceId,
  { locale },
  { headers: { 'x-contentful-enable-alpha-feature': 'some-other-set' } }
);
```

### `resolveExperience(payload, config, opts?)`

Async. Walks the payload, classifies properties, runs every component's `resolveData` in parallel, and returns a `PortableRenderPlan` ready to hand to a renderer.

| Param     | Type                                                                                                 | Required | Default | Description                                                                                                                                                                                                                                                                                                         |
| --------- | ---------------------------------------------------------------------------------------------------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `payload` | `ExperiencePayload`, an XDA response (or any structurally-compatible object)                         | yes      | n/a     | The Experience payload to resolve.                                                                                                                                                                                                                                                                                  |
| `config`  | `Config`, `{ components, experienceTemplates? }` from `defineComponent` / `defineExperienceTemplate` | yes      | n/a     | Your component + experience-template registry.                                                                                                                                                                                                                                                                      |
| `opts`    | `{ metadata?; debug?; sourceMap? }`                                                                  | no       | `{}`    | `metadata` (default `{}`) is exposed to every `resolveData` as `ctx.experience.metadata`. `debug` (default `false`) logs the resolution steps and per-node `resolveData` timings, and threads through as `ctx.experience.debug`. `sourceMap` is carried onto the plan; it wins over `payload.extensions.sourceMap`. |

`metadata` and `debug` are written onto the returned plan, which is what lets the renderer read them instead of taking them as props.

### `<ServerExperienceRenderer />`

SSR-friendly renderer. Safe to use in React Server Components.

Only `experience` and `config` are needed. The other three are **overrides** — every one of them has a value on the plan already, so pass them only to render differently than the plan was fetched for.

| Prop            | Type                                          | Required | Default               | Description                                                                                                                                                            |
| --------------- | --------------------------------------------- | -------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `experience`    | `PortableRenderPlan`                          | yes      | n/a                   | The resolved plan from `fetchExperience` or `resolveExperience`. An empty-nodes plan renders nothing.                                                                  |
| `config`        | `Config`                                      | yes      | n/a                   | Same registry passed to `resolveExperience`. Looked up at render time for dispatch. Cannot travel on the plan — see below.                                             |
| `metadata`      | `Record<string, unknown>`                     | no       | The plan's `metadata` | Shallow-merges **over** `plan.metadata`. Read via `useExperience().metadata`.                                                                                          |
| `debug`         | `boolean`                                     | no       | The plan's `debug`    | Observability switch. Shows the missing-component box, and auto-mounts `<DebugExperience>` above the tree. An explicit `false` overrides a plan fetched with debug on. |
| `renderUnknown` | `(props: MissingComponentProps) => ReactNode` | no       | `MissingComponent`    | Fallback for unregistered component types. Default `MissingComponent`: visible box when `debug` is on, silent null otherwise.                                          |

**Why `config` is still a prop.** The plan is plain serializable data by design — that is what lets it cross the RSC boundary, SvelteKit's `data`, and Angular's `TransferState`. `config` holds component references and an optional `resolveToken` function, neither of which survives serialization. So it is passed to both calls on purpose, and it is the only thing that is.

### `<ClientExperienceRenderer />` (alias: `<ExperienceRenderer />`)

Client-side renderer. Same prop shape as `ServerExperienceRenderer`, including the plan-carried defaults.

### `defineComponent<Props>(config)`

Identity helper that narrows `resolveData` and `component` parameter types to your declared `Props`. A registry entry can also be a **bare component** (`Button` instead of `{ component: Button }`) when it needs no `defaults` or `resolveData`.

| Field         | Type                                                                 | Required | Default | Description                                                                                                                                                                                                                      |
| ------------- | -------------------------------------------------------------------- | -------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `defaults`    | `Partial<Props>`                                                     | no       | `{}`    | Lowest-precedence props. Merged in before content / resolveData / slots.                                                                                                                                                         |
| `resolveData` | `(ctx: ResolveContext) => Partial<Props> \| Promise<Partial<Props>>` | no       | n/a     | Sync or async transform. Runs once per page during `resolveExperience` (before render). Receives `{ content, design (raw envelopes), experience }`.                                                                              |
| `component`   | `ComponentType<Props>`                                               | yes      | n/a     | The React component. Receives the merged props (content + resolved design + `resolveData`). Design is also readable via `useDesignValues()`; runtime context and raw payload via `useExperience()` / `useContentfulComponent()`. |

### `defineExperienceTemplate<Props>(config)`

Same shape as `defineComponent`. A coded Experience Template is an ordinary node in the experience — the only difference is which registry its id resolves against (`experienceTemplates` rather than `components`). Its slots arrive as named props like any component's, so a template with a `content` slot receives a `content: ReactNode[]` prop and renders the page layout around it.

| Field         | Type                                                                 | Required | Default | Description                                                                                                                                      |
| ------------- | -------------------------------------------------------------------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `defaults`    | `Partial<Props>`                                                     | no       | `{}`    | Same as components.                                                                                                                              |
| `resolveData` | `(ctx: ResolveContext) => Partial<Props> \| Promise<Partial<Props>>` | no       | n/a     | Same as components. Runs once per page against the template node's `props`.                                                                      |
| `component`   | `ComponentType<Props>`                                               | yes      | n/a     | Same as components: the merged props (content + resolved design + `resolveData` + named slot props). Design is also readable via the same hooks. |

### `useDesignValues<T>()` / `toCss(design, options?)`

`useDesignValues()` returns the current node's resolved design record. The optional type argument shapes the record as an assertion, not a runtime check. `toCss()` converts that record to a `CSSProperties` object, keeping only keys that map to a real CSS property and dropping semantic ones. See [Styling components](#styling-components).

`ToCssOptions`: `{ include?: string[]; exclude?: string[] }`, key filters applied against the original record keys.

### `useExperience()` / `useContentfulComponent()` / `useContentfulExperienceTemplate()`

Read the runtime context and raw Contentful payload from inside a component. Call them at the top of your component body; nothing is injected as props. `useExperience()` returns the `RenderContext` (below). `useContentfulComponent()` and `useContentfulExperienceTemplate()` return the raw payload (below) or `null` outside a node / experience template.

### `MissingComponent`

Default `renderUnknown` fallback. Visible box naming the unregistered `componentId` when `useExperience().debug === true`, silent null otherwise (a `console.warn` fires in both cases). Override per-render via the `renderUnknown` prop on either renderer — see [Custom fallback for unregistered components](#custom-fallback-for-unregistered-components-renderunknown).

### `<DebugExperience experience={plan} defaultOpen? />`

First-party debug panel. Renders the resolved `PortableRenderPlan` as pretty, circular-safe JSON inside a collapsible native `<details>`. Auto-mounted by the renderers when `debug` is on, or mount it manually anywhere. `defaultOpen` (default `false`) expands it on first paint. Import `DebugExperienceProps` for the prop type.

### `RenderContext`: what `useExperience()` returns

Every component (via `useExperience()`) and `resolveData` hook (via `ctx.experience`) sees an experience context. The shape:

| Field      | Type                      | Available in        | Description                                                                                                                                                                                                                             |
| ---------- | ------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `debug`    | `boolean`                 | render, resolveData | The single observability switch (replaces the old `isPreview`). Drives verbose logging, the visible missing-component box, and the auto-mounted `<DebugExperience>` panel. Components can branch on it for their own debug affordances. |
| `metadata` | `Record<string, unknown>` | render, resolveData | Whatever the page passed in via `resolveExperience` / `fetchExperience` opts, carried on the plan. The renderer's `metadata` prop shallow-merges over it. Free-form and untyped on purpose — see below.                                 |

`RenderContext` is declared once in the SDK core and re-exported by every adapter, so all three expose exactly the same shape — `useExperience()` in React, `getExperience()` in Svelte, `injectExperience()` in Angular.

#### `metadata` is the free-form channel, and stays untyped

`metadata` is the one place to pass your application's own data through to components and resolvers — request context, locale, feature flags, a session id. The SDK never writes a key into it; you get back exactly what you put in.

It is typed `Record<string, unknown>` deliberately. There is no separate typed slot beside it: a second customer-owned channel would duplicate this one with no clear rule for which to reach for. Narrow it at the read site when you want types:

```ts
interface PageMeta {
  slug: string;
  locale: string;
}

const { slug, locale } = useExperience().metadata as PageMeta;
```

**Contents must be plain serializable data.** `metadata` rides on the plan, which crosses server/client boundaries — functions, class instances, and client handles will not survive. Pass an id and rebuild the handle on the other side.

### `useContentfulComponent()`: the raw payload

`useContentfulComponent()` returns the unprocessed Contentful-side input for the enclosing node: unresolved design values, the originating `componentId`, the `nodeId` if the editor supplied one, and the `resolveData` output. (`useContentfulExperienceTemplate()` is the experience-template equivalent.)

Use it for:

- **Custom design resolution** outside the SDK's default cascade, such as emitting CSS variables or multi-brand theming.
- **Branching by `componentId`** in a generic wrapper component.
- **Analytics / instrumentation** keyed off `nodeId`.
- **Debug overlays** when `useExperience().debug` is on (a `<details>` with the raw payload) — or reach for the built-in [`<DebugExperience>`](#debugexperience-experienceplan-defaultopen-).

Components see `ContentfulComponent`:

| Field         | Type                                   | Description                                                                                      |
| ------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `componentId` | `string`                               | The id from `component.sys.urn`'s last slash-segment.                                            |
| `nodeId`      | `string \| undefined`                  | Pass-through of `node.id` from the payload when supplied; `undefined` otherwise.                 |
| `content`     | `Record<string, unknown>`              | Editorial values exactly as the payload delivered them.                                          |
| `design`      | `Record<string, DesignPropValue>`      | Design-property envelopes exactly as the payload delivered them.                                 |
| `resolved`    | `Record<string, unknown> \| undefined` | Return value of the component's `resolveData` hook. `undefined` when no hook is registered.      |
| `attribution` | `NodeAttribution \| undefined`         | The reportable scopes this node belongs to. `undefined` unless the fetch requested a source map. |

Experience Templates see `ContentfulExperienceTemplate`, the same shape but with `experienceTemplateId` instead of `componentId` — a coded Experience Template is an ordinary node, so it carries a `nodeId` too.

### Merge precedence (last wins)

The component receives a set of props composed in this order:

1. `defaults`, fallback values from `defineComponent`
2. resolved `design`, with tokens resolved and keyed by the raw design-property name
3. `contentProperties`, editorial values from the payload
4. `resolveData()` output, your transform's return value
5. slot props, each named slot becomes a pre-rendered React subtree

So if `content.text === 'Hello'` and `defaults.text === 'Default'`, your component receives `text: 'Hello'`. Design sits below content and `resolveData`, so an explicit editorial or resolver value always wins over design when keys collide.

The same resolved design values are also published on context, which is what the `useDesignValues()` escape hatch reads. Runtime context and the raw (pre-resolution) payload come through `useExperience()` and `useContentfulComponent()`, which are never injected as props.

Any same-named key coming from `contentProperties` (from XDA) takes precedence over a `defaults` value defined in `defineComponent` / `defineExperienceTemplate`. Only a field genuinely absent from `contentProperties` falls through to the `defaults` defined in `defineComponent` / `defineExperienceTemplate`.

---

## Design system stays portable

The integration boundary is the registry, not the components. Your `Button` is plain React with its own `ButtonProps` — content and resolved design values are just props on that interface, so the component imports nothing SDK-shaped and works in Storybook, in unit tests, and in unrelated apps. Rendering it anywhere is a matter of passing props. A component that prefers the hook imports only `useDesignValues()`, which returns `{}` outside a renderer so it still degrades gracefully.

```tsx
// components/Button.tsx: plain React, zero SDK coupling
export interface ButtonProps {
  text?: string;
  url?: string;
  type?: 'primary' | 'secondary';
}

export function Button({ text, url, type = 'primary' }: ButtonProps) {
  /* … */
}
```

The SDK-specific wiring (defaults, resolvers, prop reshaping, slot binding) all lives in one file, `lib/experience-config.tsx`, so it's easy to scan and easy to change.

---

## Workspace internals

This is an Nx monorepo. Install the framework adapter for rendering. `@contentful/experiences-node` is public for Node request handlers and other server processes, including request-bound event delivery; `@contentful/experiences-web` is public for browser fetch, resolve, and direct event work; and `@contentful/experiences-live-preview` is public for framework-neutral Preview Session use. The remaining packages are workspace-internal.

| Folder                                                   | npm name                               | Scope                                                                                                                  |
| -------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [`packages/core`](./packages/core)                       | `@contentful/experiences-sdk-core`     | **Internal.** Runtime-neutral types + `resolveExperience`.                                                             |
| [`packages/design`](./packages/design)                   | `@contentful/experiences-design`       | **Internal.** CSS-property helpers for `toCss`.                                                                        |
| [`packages/client`](./packages/client)                   | `@contentful/experiences-client`       | **Internal.** Generated Delivery boundary, XDA request types, and free fetch functions.                                |
| [`packages/runtime`](./packages/runtime)                 | `@contentful/experiences-runtime`      | **Internal.** Shared runtime, `EventBuilder`, event metadata, Optimization transport, and handoff contract.            |
| [`packages/node`](./packages/node)                       | `@contentful/experiences-node`         | **Public.** Node SDK with request-scoped fetch, resolve, and event operations.                                         |
| [`packages/web`](./packages/web)                         | `@contentful/experiences-web`          | **Public.** Web SDK with browser-owned locale/context, persisted profile, direct events, and prepared-batch admission. |
| [`packages/live-preview`](./packages/live-preview)       | `@contentful/experiences-live-preview` | **Public.** Framework-neutral Preview Session client.                                                                  |
| [`packages/adapter-react`](./packages/adapter-react)     | `@contentful/experiences-react`        | **Public.** React renderer + re-exports of everything else.                                                            |
| [`packages/adapter-svelte`](./packages/adapter-svelte)   | `@contentful/experiences-svelte`       | **Public.** Svelte 5 renderer with the same public API shape.                                                          |
| [`packages/adapter-angular`](./packages/adapter-angular) | `@contentful/experiences-angular`      | **Public.** Angular renderer (`^20 \|\| ^21 \|\| ^22`) with the same public API shape.                                 |

Future framework adapters slot in under the same pattern (`packages/adapter-vue`, and so on) and consume the same internal core and design packages. The Web SDK is a sibling public package to the Node SDK over Runtime, Client, and Core; it owns browser state and does not inherit Node request semantics.

```sh
npm install --ignore-scripts        # husky prepare can fail in fresh clones; safe to skip

npm run build                       # nx run-many -t build (topological)
npm test                            # nx run-many -t test
npm run lint                        # nx run-many -t lint
npm run typecheck                   # nx run-many -t typecheck
npx nx graph                        # visual dep graph
npm run release:dry                 # rehearse independent release
```

### Local npm artifacts

Build and pack the SDK packages for use by standalone reference implementations:

```sh
npm run build:pkgs                   # all publishable packages under packages/*
npm run pack:pkgs                    # same pipeline; reuses valid Nx build caches
npx nx run node:pack                 # optional: only Node and its local dependencies
```

`build:pkgs` is the counterpart to Optimization's suite-wide build-and-pack
workflow. The per-project `node:pack` command is an additional Nx convenience:
it prepares only Core, Client, Runtime, and Node, using the same pack tasks and
archive format as the suite-wide command. It does not install or start the Node
reference implementation.

Nx builds dependencies first and runs the existing release-artifact checks for
Runtime, Node, and Web before packing them. Packing is uncached and writes to the
ignored `pkgs/` directory: each package has its npm-generated versioned filename
and a stable alias such as `contentful-experiences-node-local.tgz`. Each task
replaces only its own archives; older versioned files can remain in `pkgs/`.
The stable alias is replaced only after a complete archive passes entry-point
checks; failures stop the command.

The helper runs `npm pack` against each package's publication files and checks
that its exported entry points are included. It preserves package manifests,
including dependency ranges, scripts, and devDependencies, so local artifacts
exercise the same metadata as publication. Lifecycle scripts are disabled during
packing; Nx performs the required builds explicitly. These commands do not change
versions, publish to a registry, or install a reference implementation.

Run the packaging helper's checks with `npx nx test package-tools` and
`npx nx lint package-tools`. They also participate in the root test/lint commands.

The [standalone Node reference implementation](./implementations/node-sdk/README.md)
uses these artifacts with its own dependencies and `.env`. Prepare it with
`npx nx run implementation-node-sdk:setup`, then run
`npx nx run implementation-node-sdk:dev`. Root aggregate checks exclude
implementations; their README documents the explicit Nx commands.

The [standalone Web reference implementation](./implementations/web-sdk/README.md)
uses the packed Web UMD distribution with browser-owned state and direct live
delivery. Run `npx nx run implementation-web-sdk:setup`, then
`npx nx run implementation-web-sdk:dev`. Its README covers local environment
configuration, consent, interaction tracking, and scoped validation commands.

Root PM2 shortcuts match Optimization: `npm run pm2:list`, `npm run pm2:logs`,
`npm run pm2:stop:all`, and `npm run pm2:delete:all`. The `all` commands affect
every process in the selected PM2 home. Use the implementation's scoped stop
target when managing only one reference app.

For deeper context (design decisions, multi-framework architecture notes, conventions, and gotchas), see [`AGENTS.md`](./AGENTS.md).

---

## Contributing

Contributions are welcome. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for development setup, coding standards, and the PR process, along with our [Code of Conduct](https://github.com/contentful/.github/blob/master/CODE_OF_CONDUCT.md).

## Support

For usage questions and support, [visit the Contentful support center](https://support.contentful.com/hc/en-us). Use [GitHub issues](https://github.com/contentful/experiences/issues) for bugs and feature requests.

## License

MIT. See [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE).
