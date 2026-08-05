# Contentful Experiences SDK

> ⚠️ **Alpha.** Published to npm. APIs are unstable and will change.

A renderer SDK for Contentful's **Experience Orchestration (ExO)**. You bring a design system; the SDK takes the Experience payload from the Experience Delivery API (XDA) and renders it.

Install the adapter for your framework:

```sh
npm install @contentful/experiences-react     # React / Next.js
npm install @contentful/experiences-svelte    # Svelte / SvelteKit
```

That's the only SDK package you install. The adapter re-exports everything you need: resolver, types, renderer, design utilities, and the experience delivery client. The `@contentful/experiences-sdk-core`, `@contentful/experiences-design`, and `@contentful/experiences-client` packages are workspace-internal implementation details.

Both adapters share the same public-API shape: the same `Config`, the same `fetchExperience`, and the same styling model — design values are resolved on the server and auto-filled onto your components as ordinary props, with the `useDesignValues`/`getDesignValues` hook available for the cases that need it. The walkthrough below uses React. The [Svelte / SvelteKit](#svelte--sveltekit) section shows the same three steps in Svelte, with the differences called out inline, and runnable apps for both live in [`examples/`](#examples).

## Contents

- [Getting started](#getting-started-the-simple-path)
- [Styling components](#styling-components)
- [Design tokens](#design-tokens)
- [Advanced setup](#advanced-setup)
- [Svelte / SvelteKit](#svelte--sveltekit)
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

### 1. Register your components and (optional) templates

```tsx
// lib/experience-config.tsx
import {
  defineComponent,
  type Components,
  type Config,
  type ResolveToken,
  type Templates,
} from '@contentful/experiences-react';

import { Button } from './components/Button';
import { Heading, type HeadingProps } from './components/Heading';
import { Page } from './components/Page';

const components: Components = {
  // Keys match the segment after the last slash in `componentType.sys.urn`.
  // Example URN: crn:contentful:::experience:spaces/$self/environments/$self/componentTypes/Button
  //
  // Register a bare component for the common case…
  Button,
  // …or the config object when you need defaults / resolveData.
  Heading: defineComponent<HeadingProps>({
    defaults: { text: 'Untitled' },
    component: Heading,
  }),
};

const templates: Templates = {
  // Optional. Keys match `payload.sys.template.sys.urn` last-segment.
  page: Page,
};

// Optional. Resolves opaque design-token ids to their underlying values (see "Design tokens").
const resolveToken: ResolveToken = (token) => `var(--${token.value.replaceAll('.', '-')})`;

export const experienceConfig: Config = { components, templates, resolveToken };
```

Components are registered by id and receive their **content** props together with their **resolved design** props (spacing, color, typography, layout) — the SDK resolves design server-side and auto-fills it onto the same props object. Styling straight from props is the recommended path; the `useDesignValues()` hook remains available for cases props don't cover. Both are covered in [Styling components](#styling-components) below.

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

A working version is at [`examples/nextjs/app/[slug]/page.tsx`](./examples/nextjs/app/[slug]/page.tsx).

---

## Styling components

Design values are resolved **on the server** — inside `fetchExperience` / `resolveExperience` — and auto-filled onto your component's props alongside content. Each design property lands on a prop of the same key: a design property named `backgroundColor` arrives as a prop named `backgroundColor`, already cascaded to the active viewport and with any [design tokens](#design-tokens) resolved. Your component is a plain function of its props and styles itself directly from them:

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

Because resolution happens server-side, the first SSR paint is already correctly styled — there's no flash of unstyled or mis-styled content waiting on the client to compute the viewport. Both real CSS-shaped values (`fontSize`, `backgroundColor`) and author-defined semantic values (`variant`, `as`, `ratio`) arrive the same way; read the semantic ones by name and pass the CSS-shaped ones into your `style`.

### Reading design with the hook (optional)

Props cover the common case. The `useDesignValues()` hook reads the **same** resolved design record from context, for the cases where props aren't the right fit — a deeply nested presentational child that isn't itself a registered component, or code that needs design outside the render path (a `useEffect`, an imperative measurement):

```tsx
'use client';
import { toCss, useDesignValues } from '@contentful/experiences-react';

interface HeadingDesign {
  as?: 'h1' | 'h2' | 'h3';
  fontSize?: string;
  fontWeight?: string;
}

export function Heading({ text }: { text?: string }) {
  const design = useDesignValues<HeadingDesign>(); // typed like useState<T>()
  const Tag = design.as ?? 'h2'; // semantic key, read by name

  // toCss keeps fontSize/fontWeight and drops `as`.
  return <Tag style={toCss(design)}>{text}</Tag>;
}
```

- `useDesignValues<T>()` takes an optional type argument for editor ergonomics. It's an assertion rather than a runtime check, so treat keys as possibly `undefined`.
- It returns the same values that auto-fill props, and returns `{}` outside a renderer, so components degrade gracefully in isolation. It's **not required** — a component can style entirely from props and never call it.
- `toCss(design, { include, exclude })` converts a design record to a `CSSProperties` object, keeping only keys that map to a real CSS property and dropping semantic ones. It accepts optional key filters. Handy with the hook; with props you typically just spread the CSS-shaped keys yourself.
- If `toCss` doesn't recognize a value, the property whitelist is extensible. See [`packages/design`](./packages/design).

The Svelte adapter works the same way — design auto-fills props, and `getDesignValues()` is the optional hook — covered in [Svelte / SvelteKit](#svelte--sveltekit).

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

Returning `undefined` means "not resolvable": the SDK drops that key so the component's own default takes over, and it won't appear in the auto-filled props (nor in `useDesignValues()`). With no `resolveToken` configured, tokens pass through unresolved and the SDK warns once in development, naming the component whose token it couldn't resolve.

---

## Advanced setup

When the simple path isn't enough, a few optional features cover most production needs. Per-page `metadata` flows into resolvers. `debug` mode surfaces what the SDK saw (visible missing-component boxes, verbose logs, a JSON dump panel). Viewport seeding makes SSR match the device. Async `resolveData` enriches props from external sources. Use any combination of them.

A full working route is at [`examples/nextjs/app/[slug]/page.tsx`](./examples/nextjs/app/[slug]/page.tsx). Visit `/<id>?debug=true&locale=en-US` after running the example.

```tsx
// app/[slug]/page.tsx
import { headers } from 'next/headers';
import { fetchExperience, ServerExperienceRenderer } from '@contentful/experiences-react';

import { detectViewportFromUserAgent } from '@/lib/detect-viewport';
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

  // 1. UA → viewport id, so SSR matches the device's expected viewport.
  const userAgent = (await headers()).get('user-agent') ?? '';
  const initialViewportId = detectViewportFromUserAgent(userAgent);

  // 2. Per-page metadata flows into every resolveData hook; debug is the
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
      initialViewportId={initialViewportId}
      metadata={{ slug: experienceId, locale }}
      debug={debug}
    />
  );
}
```

### Async `resolveData` with external fetch

Each `defineComponent` entry can declare an async `resolveData` that derives final props from external sources. The SDK fans these out across all nodes with `Promise.all`, so a slow resolver doesn't block its peers.

When does it run? Once per page render, inside `resolveExperience(payload, config, opts?)`, before the renderer mounts. By the time `<ServerExperienceRenderer>` walks the tree, every `resolveData` has settled and its return value is sitting on `node.props.resolved`. Resolvers do **not** re-run on viewport changes, prop changes, or client-side navigation. To re-fetch, call `resolveExperience` again, typically on a fresh server request.

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
- **Shows the missing-component box** — `MissingComponent` renders a visible box naming the unregistered `componentTypeId` (silent `null` when debug is off).
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

function Fallback({ componentTypeId, nodeId }: MissingComponentProps) {
  return (
    <div data-unregistered={componentTypeId}>
      Unregistered component “{componentTypeId}”{nodeId ? ` (#${nodeId})` : ''}.
    </div>
  );
}

<ServerExperienceRenderer
  experience={experience}
  config={experienceConfig}
  renderUnknown={Fallback}
/>;
```

`renderUnknown` receives `{ componentTypeId, nodeId? }`. It renders unconditionally (your override, not the SDK, decides whether to gate on `debug` via `useExperience().debug`). The Svelte adapter takes the same prop with a Svelte component.

---

## Svelte / SvelteKit

`@contentful/experiences-svelte` is the Svelte 5 adapter. The public API matches React one for one: the same `Config`, `fetchExperience`, `resolveExperience`, `ServerExperienceRenderer`/`ClientExperienceRenderer`, design tokens, and `defineComponent`/`defineTemplate`. Three differences, all mechanical:

| Concern              | React                                          | Svelte                                                                                                  |
| -------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Register a component | `component:` takes a React component           | `component:` takes a Svelte component                                                                   |
| Read design (optional hook) | `useDesignValues()`                     | `getDesignValues()` (read inside a `$derived`)                                                          |
| Runtime context      | `useExperience()` / `useContentfulComponent()` | `getExperience()` / `getContentfulComponent()`                                                          |
| Slots                | each slot is a named React-node prop           | default slot is a `children` Snippet; others via `getContentfulComponent().slots` + `<NodesRenderer />` |

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

The `getDesignValues()` hook is available for the same optional cases as React — read it inside a `$derived` so it stays reactive across viewport changes:

```svelte
<!-- optional: read the same resolved record via the hook -->
<script lang="ts">
  import { getDesignValues, toCss } from '@contentful/experiences-svelte';

  let { text }: { text?: string } = $props();

  const design = $derived(getDesignValues<{ as?: 'h1' | 'h2' | 'h3' }>());
  const tag = $derived(design.as ?? 'h2');
  const style = $derived(toCss(design)); // keeps CSS-shaped keys, drops `as`
</script>

<svelte:element this={tag} {style}>{text}</svelte:element>
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

Everything else applies identically: advanced setup (preview, viewport seeding, async `resolveData`), the API reference below, merge precedence, and design tokens. Substitute the Svelte spelling of each hook.

---

## Examples

Runnable apps for both frameworks live in [`examples/`](./examples). They register the same components against the same Experience payload, so they render identically; only the framework-specific setup differs.

| Example                                      | Stack                   | Shows                                                                                  |
| -------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------- |
| [`examples/nextjs`](./examples/nextjs)       | Next.js 15 (App Router) | Preview mode, UA→viewport, async `resolveData`, design tokens, styling hooks           |
| [`examples/sveltekit`](./examples/sveltekit) | SvelteKit 2 + Svelte 5  | 1:1 parity with the Next.js app; hydration-safe viewport seeding via `+page.server.ts` |

Both examples render the same demo Experience. To run them you first seed that Experience into your Contentful space with the one-time bootstrap script — the script uses the experiences management API to provision the ContentType, entries, assets, design tokens, ComponentTypes, template, DataAssemblies, and the Experience itself.

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

Three positional args map to three concerns that evolve independently:

| Arg                 | Type                                                                  | Purpose                                                                                                                                                    |
| ------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `experienceOptions` | `{ spaceId, environmentId, experienceId, locale? }`                   | Which Experience to fetch. Future digital-property identifiers widen this type.                                                                            |
| `clientOptions`     | `{ accessToken, previewToken?, preview?, host? }` **or** `{ client }` | How to fetch. Discriminated union: pass credentials inline (with optional preview toggle) or pass in your own `ContentfulViewDeliveryClient`.              |
| `resolveOptions`    | `{ config, metadata?, debug? }`                                       | How to resolve. `metadata` flows into every `resolveData` hook as `ctx.experience.metadata`; `debug` turns on logging + the visible missing-component box. |

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

### `resolveExperience(payload, config, opts?)`

Async. Walks the payload, classifies properties, runs every component's `resolveData` in parallel, and returns a `PortableRenderPlan` ready to hand to a renderer.

| Param     | Type                                                                             | Required | Default | Description                                                                                                                                                                                                                      |
| --------- | -------------------------------------------------------------------------------- | -------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `payload` | `ExperiencePayload`, an XDA response (or any structurally-compatible object)     | yes      | n/a     | The Experience payload to resolve.                                                                                                                                                                                               |
| `config`  | `Config`, `{ components, templates? }` from `defineComponent` / `defineTemplate` | yes      | n/a     | Your component + template registry.                                                                                                                                                                                              |
| `opts`    | `{ metadata?: Record<string, unknown>; debug?: boolean }`                        | no       | `{}`    | `metadata` (default `{}`) is exposed to every `resolveData` as `ctx.experience.metadata`. `debug` (default `false`) logs the resolution steps and per-node `resolveData` timings, and threads through as `ctx.experience.debug`. |

### `<ServerExperienceRenderer />`

SSR-friendly renderer. No reactive subscriptions; the active viewport is resolved once from `initialViewportId`. Safe to use in React Server Components.

| Prop                | Type                                          | Required | Default            | Description                                                                                                                                  |
| ------------------- | --------------------------------------------- | -------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `experience`        | `PortableRenderPlan`                          | yes      | n/a                | The resolved plan from `fetchExperience` or `resolveExperience`. An empty-nodes plan renders nothing.                                        |
| `config`            | `Config`                                      | yes      | n/a                | Same registry passed to `resolveExperience`. Looked up at render time for dispatch.                                                          |
| `initialViewportId` | `string`                                      | no       | First viewport id  | Seeds the active viewport. Typically derived from User-Agent server-side.                                                                    |
| `metadata`          | `Record<string, unknown>`                     | no       | `{}`               | Per-render metadata merged onto the render-time `experience` context. Read via `useExperience().metadata`.                                   |
| `debug`             | `boolean`                                     | no       | `false`            | Observability switch. Shows the missing-component box, and auto-mounts `<DebugExperience>` above the tree. Read via `useExperience().debug`. |
| `renderUnknown`     | `(props: MissingComponentProps) => ReactNode` | no       | `MissingComponent` | Fallback for unregistered component types. Default `MissingComponent`: visible box when `debug` is on, silent null otherwise.                |

### `<ClientExperienceRenderer />` (alias: `<ExperienceRenderer />`)

Client-side renderer with reactive viewport tracking via `window.matchMedia`. Use in `'use client'` components. Throws if rendered on the server. Same prop shape as `ServerExperienceRenderer`.

### `defineComponent<Props>(config)`

Identity helper that narrows `resolveData` and `component` parameter types to your declared `Props`. A registry entry can also be a **bare component** (`Button` instead of `{ component: Button }`) when it needs no `defaults` or `resolveData`.

| Field         | Type                                                                 | Required | Default | Description                                                                                                                                                                           |
| ------------- | -------------------------------------------------------------------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `defaults`    | `Partial<Props>`                                                     | no       | `{}`    | Lowest-precedence props. Merged in before content / resolveData / slots.                                                                                                              |
| `resolveData` | `(ctx: ResolveContext) => Partial<Props> \| Promise<Partial<Props>>` | no       | n/a     | Sync or async transform. Runs once per page during `resolveExperience` (before render); does not re-run on viewport changes. Receives `{ content, design (unresolved), experience }`. |
| `component`   | `ComponentType<Props>`                                               | yes      | n/a     | The React component. Receives the merged props (content + resolved design + `resolveData`). Design is also readable via `useDesignValues()`; runtime context and raw payload via `useExperience()` / `useContentfulComponent()`. |

### `defineTemplate<Props>(config)`

Same shape as `defineComponent`. The `component` also receives a fixed `children: ReactNode` (the rendered experience nodes), so a template renders the page-level layout around them.

| Field         | Type                                                                 | Required | Default | Description                                                                                 |
| ------------- | -------------------------------------------------------------------- | -------- | ------- | ------------------------------------------------------------------------------------------- |
| `defaults`    | `Partial<Props>`                                                     | no       | `{}`    | Same as components.                                                                         |
| `resolveData` | `(ctx: ResolveContext) => Partial<Props> \| Promise<Partial<Props>>` | no       | n/a     | Same as components. Runs once per render against the template's `props`.                    |
| `component`   | `ComponentType<Props & { children?: ReactNode }>`                    | yes      | n/a     | Receives the merged props (content + resolved design + `resolveData`) plus `children`. Design is also readable via the same hooks. |

### `useDesignValues<T>()` / `toCss(design, options?)`

`useDesignValues()` returns the current node's resolved design record (viewport-cascaded and token-resolved). The optional type argument shapes the record as an assertion, not a runtime check. `toCss()` converts that record to a `CSSProperties` object, keeping only keys that map to a real CSS property and dropping semantic ones. See [Styling components](#styling-components).

`ToCssOptions`: `{ include?: string[]; exclude?: string[] }`, key filters applied against the original record keys.

### `useExperience()` / `useContentfulComponent()` / `useContentfulTemplate()`

Read the runtime context and raw Contentful payload from inside a component. Call them at the top of your component body; nothing is injected as props. `useExperience()` returns the `RenderContext` (below). `useContentfulComponent()` and `useContentfulTemplate()` return the raw payload (below) or `null` outside a node/template.

### `useActiveViewport(viewports, initialViewportId?)`

React hook used internally by `ClientExperienceRenderer`. You'll rarely need it directly. Returns `{ activeViewportIndex }` and updates on `matchMedia` changes.

### `MissingComponent`

Default `renderUnknown` fallback. Visible box naming the unregistered `componentTypeId` when `useExperience().debug === true`, silent null otherwise (a `console.warn` fires in both cases). Override per-render via the `renderUnknown` prop on either renderer — see [Custom fallback for unregistered components](#custom-fallback-for-unregistered-components-renderunknown).

### `<DebugExperience experience={plan} defaultOpen? />`

First-party debug panel. Renders the resolved `PortableRenderPlan` as pretty, circular-safe JSON inside a collapsible native `<details>`. Auto-mounted by the renderers when `debug` is on, or mount it manually anywhere. `defaultOpen` (default `false`) expands it on first paint. Import `DebugExperienceProps` for the prop type.

### `RenderContext`: what `useExperience()` returns

Every component (via `useExperience()`) and `resolveData` hook (via `ctx.experience`) sees an experience context. The shape:

| Field                 | Type                      | Available in        | Description                                                                                                                                                                                                                             |
| --------------------- | ------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `debug`               | `boolean`                 | render, resolveData | The single observability switch (replaces the old `isPreview`). Drives verbose logging, the visible missing-component box, and the auto-mounted `<DebugExperience>` panel. Components can branch on it for their own debug affordances. |
| `metadata`            | `Record<string, unknown>` | render, resolveData | Whatever the page passed in via `resolveExperience` opts / renderer `metadata` prop. Free-form.                                                                                                                                         |
| `viewports`           | `ViewportDef[]`           | render, resolveData | All viewports declared on the experience, in cascade order. Stable for the duration of the page render.                                                                                                                                 |
| `activeViewport`      | `ViewportDef`             | render only         | The currently active viewport, the last-matching media query or device trait. Absent in `resolveData` because it's a render-time value that would re-fire async resolvers on every viewport change.                                     |
| `activeViewportIndex` | `number`                  | render only         | Index of `activeViewport` in `viewports`. Same caveat.                                                                                                                                                                                  |

### `useContentfulComponent()`: the raw payload

`useContentfulComponent()` returns the unprocessed Contentful-side input for the enclosing node: unresolved design values, the originating `componentTypeId`, the `nodeId` if the editor supplied one, and the `resolveData` output. (`useContentfulTemplate()` is the template equivalent.)

Use it for:

- **Custom design resolution** outside the SDK's default cascade, such as emitting CSS variables or multi-brand theming.
- **Branching by `componentTypeId`** in a generic wrapper component.
- **Analytics / instrumentation** keyed off `nodeId`.
- **Debug overlays** when `useExperience().debug` is on (a `<details>` with the raw payload) — or reach for the built-in [`<DebugExperience>`](#debugexperience-experienceplan-defaultopen-).

Components see `ContentfulComponent`:

| Field             | Type                                   | Description                                                                                 |
| ----------------- | -------------------------------------- | ------------------------------------------------------------------------------------------- |
| `componentTypeId` | `string`                               | The id from `componentType.sys.urn`'s last slash-segment.                                   |
| `nodeId`          | `string \| undefined`                  | Pass-through of `node.id` from the payload when supplied; `undefined` otherwise.            |
| `content`         | `Record<string, unknown>`              | Editorial values exactly as the payload delivered them.                                     |
| `design`          | `Record<string, DesignPropValue>`      | Design properties in their raw form (not viewport-resolved).                                |
| `resolved`        | `Record<string, unknown> \| undefined` | Return value of the component's `resolveData` hook. `undefined` when no hook is registered. |

Templates see `ContentfulTemplate`, the same shape but with `templateId` instead of `componentTypeId` (and no `nodeId`).

### Merge precedence (last wins)

The component receives a flat set of props composed in this order:

1. `defaults`, fallback values from `defineComponent`
2. resolved `design`, viewport-cascaded and token-resolved, keyed by the raw design-property name
3. `contentProperties`, editorial values from the payload
4. `resolveData()` output, your transform's return value
5. slot props, each named slot becomes a pre-rendered React subtree

So if `content.text === 'Hello'` and `defaults.text === 'Default'`, your component receives `text: 'Hello'`. Design sits below content and `resolveData`, so an explicit editorial or resolver value always wins over design on a key collision.

The same resolved design values are also published on context, so they remain readable via `useDesignValues()` for components that prefer the hook. Runtime context and the raw (pre-resolution) payload are read through `useExperience()` and `useContentfulComponent()`, which are never injected as props.

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

This is an Nx monorepo. You install only the framework adapter; the rest is workspace-internal.

| Folder                                                 | npm name                           | Scope                                                                                              |
| ------------------------------------------------------ | ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| [`packages/core`](./packages/core)                     | `@contentful/experiences-sdk-core` | **Internal.** Runtime-neutral types + `resolveExperience`.                                         |
| [`packages/design`](./packages/design)                 | `@contentful/experiences-design`   | **Internal.** Viewport math (`getValueForViewport`, `resolveDesignProperties`, `toCssMediaQuery`). |
| [`packages/client`](./packages/client)                 | `@contentful/experiences-client`   | **Internal.** Experience delivery client + `fetchExperience`.                                      |
| [`packages/adapter-react`](./packages/adapter-react)   | `@contentful/experiences-react`    | **Public.** React renderer + re-exports of everything else.                                        |
| [`packages/adapter-svelte`](./packages/adapter-svelte) | `@contentful/experiences-svelte`   | **Public.** Svelte 5 renderer with the same public API shape.                                      |

Future framework adapters slot in under the same pattern (`packages/adapter-vue`, `packages/adapter-angular`, and so on) and consume the same internal core and design packages.

```sh
npm install --ignore-scripts        # husky prepare can fail in fresh clones; safe to skip

npm run build                       # nx run-many -t build (topological)
npm test                            # nx run-many -t test
npm run lint                        # nx run-many -t lint
npm run typecheck                   # nx run-many -t typecheck
npx nx graph                        # visual dep graph
npm run release:dry                 # rehearse independent release
```

For deeper context (design decisions, multi-framework architecture notes, conventions, and gotchas), see [`AGENTS.md`](./AGENTS.md).

---

## Contributing

Contributions are welcome. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for development setup, coding standards, and the PR process, along with our [Code of Conduct](https://github.com/contentful/.github/blob/master/CODE_OF_CONDUCT.md).

## Support

For usage questions and support, [visit the Contentful support center](https://support.contentful.com/hc/en-us). Use [GitHub issues](https://github.com/contentful/experiences/issues) for bugs and feature requests.

## License

MIT. See [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE).
