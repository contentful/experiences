# Contentful Experiences SDK

> ⚠️ **Pre-alpha.** Not yet published to npm. APIs are unstable and will change.

A renderer SDK for Contentful's **Experience Orchestration (ExO)**. You bring a design system; the SDK takes the Experience payload from the Experience Delivery API (XDA) and renders it.

Install the adapter for your framework:

```sh
npm install @contentful/experiences-react     # React / Next.js
npm install @contentful/experiences-svelte    # Svelte / SvelteKit
```

That's the only SDK package you install. The adapter re-exports everything you need: resolver, types, renderer, design utilities, and the experience delivery client. The `@contentful/experiences-core`, `@contentful/experiences-design`, and `@contentful/experiences-client` packages are workspace-internal implementation details.

Both adapters share the same public-API shape: the same `Config`, the same `fetchExperience`, and the same design-token plus `useDesignValues`/`getDesignValues` styling model. The walkthrough below uses React. The [Svelte / SvelteKit](#svelte--sveltekit) section shows the same three steps in Svelte, with the differences called out inline, and runnable apps for both live in [`examples/`](#examples).

---

## Getting started: the simple path

Three steps: register your components, fetch and resolve, render. The minimal page is one `fetchExperience` call feeding one `<ServerExperienceRenderer>`.

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

Components are registered by id and receive only their **content** props. They read design (spacing, color, typography, layout) themselves through the `useDesignValues()` hook, covered in [Styling components](#styling-components) below.

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

The signature is three grouped params: what to fetch (space, env, experience), how to fetch (auth), and how to resolve (component config plus per-render context). Each group evolves on its own, so future personalization params, digital-property identifiers, and transport options fit their respective group without reshaping the signature.

A working version is at [`examples/nextjs/app/[slug]/page.tsx`](./examples/nextjs/app/[slug]/page.tsx).

---

## Styling components

Design values are **not** injected as props. A component reads them itself through the `useDesignValues()` hook, the one place design comes from. That keeps the SDK from spreading unknown `cf`-prefixed props onto your components and keeps your prop types clean.

The hook returns a flat record of every resolved design value for the current node: viewport-cascaded, token-resolved, keyed exactly as authored. That includes real CSS-shaped values like `fontSize` and `backgroundColor`, plus author-defined semantic styling like `variant`, `as`, and `ratio`.

`toCss()` turns that record into a ready-to-spread `CSSProperties` object, keeping only the keys that map to a real CSS property and dropping the semantic ones:

```tsx
// components/Heading.tsx
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
- `toCss(design, { include, exclude })` accepts optional key filters. Read semantic keys like `as` and `variant` by name.
- If `toCss` doesn't recognize a value, the property whitelist is extensible. See [`packages/design`](./packages/design).

The Svelte adapter works the same way with `getDesignValues()`, covered in [Svelte / SvelteKit](#svelte--sveltekit).

## Design tokens

When a design property's value is an ExO **design token** rather than a literal, XDA delivers a `{ type: 'DesignToken', value: '<token-id>' }` envelope. The id is just an opaque reference. The actual value lives in your design system, and only you know how to look it up, so `resolveToken` is where you turn that reference into its underlying value before it reaches a component:

```ts
const resolveToken: ResolveToken = (token) => designTokens[token.value];

export const experienceConfig: Config = { components, resolveToken };
```

The id shape is yours (dotted, slashed, flat, whatever your DTCG export emits). The SDK never interprets it; it hands you `token.value` and uses whatever you return. However you store your tokens, that's what `resolveToken` reaches into:

```ts
// 1. CSS custom properties. No JS cost, and the browser handles theme swaps.
resolveToken: (token) => `var(--${token.value.replaceAll('.', '-')})`;

// 2. A tokens object or DTCG package.
resolveToken: (token) => designTokens[token.value];

// 3. Tailwind. Walk the resolved theme by id path.
resolveToken: (token) => token.value.split('.').reduce((o, k) => o?.[k], tw.theme);
```

Returning `undefined` means "not resolvable": the SDK drops that key so the component's own default takes over, and `useDesignValues()` won't include it. With no `resolveToken` configured, token envelopes pass through unresolved and the SDK warns once in development.

---

## Advanced setup

When the simple path isn't enough, three optional knobs cover most production needs. Preview mode plus metadata flows per-page context into resolvers. Viewport seeding makes SSR match the device. Async `resolveData` enriches props from external sources. Mix and match as needed.

A full working advanced route is at [`examples/nextjs/app/advanced/[slug]/page.tsx`](./examples/nextjs/app/advanced/[slug]/page.tsx). Visit `/advanced/<id>?preview=true&locale=en-US` after running the example.

```tsx
// app/advanced/[slug]/page.tsx
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import {
  fetchExperience,
  NotFoundError,
  ServerExperienceRenderer,
} from '@contentful/experiences-react';

import { detectViewportFromUserAgent } from '@/lib/detect-viewport';
import { advancedExperienceConfig } from '@/lib/experience-config-advanced';

export default async function AdvancedPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug: experienceId } = await params;
  const sp = await searchParams;
  const previewMode = sp.preview === 'true';
  const locale = (sp.locale as string) ?? 'en-US';

  // 1. UA → viewport id, so SSR matches the device's expected viewport.
  const userAgent = (await headers()).get('user-agent') ?? '';
  const initialViewportId = detectViewportFromUserAgent(userAgent);

  try {
    // 2. Per-page metadata flows into every resolveData hook via context.
    const experience = await fetchExperience(
      { spaceId: process.env.SPACE_ID!, environmentId: 'master', experienceId, locale },
      {
        accessToken: process.env.CDA_TOKEN!,
        host: previewMode ? 'https://preview.xdn.contentful.com' : 'https://xdn.contentful.com',
      },
      {
        config: advancedExperienceConfig,
        context: { isPreview: previewMode, metadata: { slug: experienceId, locale } },
      }
    );

    return (
      <ServerExperienceRenderer
        experience={experience}
        config={advancedExperienceConfig}
        initialViewportId={initialViewportId}
        context={{ isPreview: previewMode, metadata: { slug: experienceId, locale } }}
      />
    );
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
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

`experience.metadata` here is exactly what the page passed into `resolveExperience`'s third argument. That's how per-page context reaches every resolver.

---

## Svelte / SvelteKit

`@contentful/experiences-svelte` is the Svelte 5 adapter. The public API matches React one for one: the same `Config`, `fetchExperience`, `resolveExperience`, `ServerExperienceRenderer`/`ClientExperienceRenderer`, design tokens, and `defineComponent`/`defineTemplate`. Three differences, all mechanical:

| Concern              | React                                          | Svelte                                                                                                  |
| -------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Register a component | `component:` takes a React component           | `component:` takes a Svelte component                                                                   |
| Read design          | `useDesignValues()`                            | `getDesignValues()` (read inside a `$derived`)                                                          |
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

### 2. Style a component with `getDesignValues()`

```svelte
<!-- components/Heading.svelte -->
<script lang="ts">
  import { getDesignValues, toCss } from '@contentful/experiences-svelte';

  let { text }: { text?: string } = $props();

  // Read inside a $derived so it stays reactive across viewport changes.
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

Runnable apps for both frameworks live in [`examples/`](./examples). They register the same components against the same Experience payload, so they render identically; only the framework chrome differs.

| Example                                      | Stack                   | Shows                                                                                              |
| -------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------- |
| [`examples/nextjs`](./examples/nextjs)       | Next.js 15 (App Router) | Simple + advanced routes (preview, UA→viewport, async `resolveData`), design tokens, styling hooks |
| [`examples/sveltekit`](./examples/sveltekit) | SvelteKit 2 + Svelte 5  | 1:1 parity with the Next.js app; hydration-safe viewport seeding via `+page.server.ts`             |

```sh
npm install --ignore-scripts
npm run build                       # build the SDK packages

cd examples/nextjs                  # or examples/sveltekit
cp .env.example .env.local          # sveltekit uses .env; fill in SPACE_ID + CDA_TOKEN
npm run dev
```

Then visit `/<experience-id>`. See each example's README for its file map and route-by-route walkthrough.

---

## API reference

### `fetchExperience(experienceOptions, clientOptions, resolveOptions)`

Async. Fetches an Experience from the Experience Delivery API and resolves it in one call, the same as fetching the payload yourself and then calling `resolveExperience`. Returns a `PortableRenderPlan`.

Three positional args map to three concerns that evolve independently:

| Arg                 | Type                                                | Purpose                                                                                                |
| ------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `experienceOptions` | `{ spaceId, environmentId, experienceId, locale? }` | Which Experience to fetch. Future digital-property identifiers widen this type.                        |
| `clientOptions`     | `{ accessToken, host? }` **or** `{ client }`        | How to fetch. Discriminated union: pass creds inline or bring your own `ContentfulViewDeliveryClient`. |
| `resolveOptions`    | `{ config, context? }`                              | How to resolve. `context` flows into every `resolveData` hook as `ctx.experience`.                     |

`host` is a full base-URL string (for example `'https://preview.xdn.contentful.com'` for the preview API). When omitted, the delivery client's default endpoint is used.

```ts
// Inline credentials, client created internally
const plan = await fetchExperience(
  { spaceId: '...', environmentId: 'master', experienceId: slug, locale: 'en-US' },
  { accessToken: process.env.CDA_TOKEN!, host: 'https://preview.xdn.contentful.com' },
  { config: experienceConfig, context: { isPreview: true, metadata: { slug } } }
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

Functional constructor over `ContentfulViewDeliveryClient` for the SDK's option shape. It maps `accessToken` to `token` and `host` to `baseUrl`, and passes everything else through. Prefer this over `new ContentfulViewDeliveryClient({...})` so field names stay consistent with `fetchExperience`'s inline-creds path.

```ts
import { createClient } from '@contentful/experiences-react';

const client = createClient({
  accessToken: process.env.CDA_TOKEN!,
  host: 'https://preview.xdn.contentful.com', // optional; overrides the default endpoint
  // headers, timeoutInSeconds, maxRetries, fetch, logging, etc. all pass through
});
```

### `resolveExperience(payload, config, opts?)`

Async. Walks the payload, classifies properties, runs every component's `resolveData` in parallel, and returns a `PortableRenderPlan` ready to hand to a renderer.

| Param     | Type                                                                             | Required | Default | Description                                                                                                                                                           |
| --------- | -------------------------------------------------------------------------------- | -------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `payload` | `ExperiencePayload`, an XDA response (or any structurally-compatible object)     | yes      | n/a     | The Experience payload to resolve.                                                                                                                                    |
| `config`  | `Config`, `{ components, templates? }` from `defineComponent` / `defineTemplate` | yes      | n/a     | Your component + template registry.                                                                                                                                   |
| `opts`    | `{ experience?: Partial<ExperienceContext> }`                                    | no       | `{}`    | Per-render context shallow-merged into the default `{ isPreview: false, metadata: {} }`. The merged context is what every `resolveData` receives as `ctx.experience`. |

### `<ServerExperienceRenderer />`

SSR-friendly renderer. No reactive subscriptions; the active viewport is resolved once from `initialViewportId`. Safe to use in React Server Components.

| Prop                | Type                                          | Required | Default                              | Description                                                                                            |
| ------------------- | --------------------------------------------- | -------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `experience`        | `PortableRenderPlan`                          | yes      | n/a                                  | The resolved plan from `fetchExperience` or `resolveExperience`. An empty-nodes plan renders nothing.  |
| `config`            | `Config`                                      | yes      | n/a                                  | Same registry passed to `resolveExperience`. Looked up at render time for dispatch.                    |
| `initialViewportId` | `string`                                      | no       | First viewport id                    | Seeds the active viewport. Typically derived from User-Agent server-side.                              |
| `context`           | `Partial<ExperienceContext>`                  | no       | `{ isPreview: false, metadata: {} }` | Shallow-merged into the render-time `experience` context your components receive.                      |
| `renderUnknown`     | `(props: MissingComponentProps) => ReactNode` | no       | `MissingComponent`                   | Fallback for unregistered component types. Default: visible red box in preview, silent null otherwise. |

### `<ClientExperienceRenderer />` (alias: `<ExperienceRenderer />`)

Client-side renderer with reactive viewport tracking via `window.matchMedia`. Use in `'use client'` components. Throws if rendered on the server. Same prop shape as `ServerExperienceRenderer`.

### `defineComponent<Props>(config)`

Identity helper that narrows `resolveData` and `component` parameter types to your declared `Props`. A registry entry can also be a **bare component** (`Button` instead of `{ component: Button }`) when it needs no `defaults` or `resolveData`.

| Field         | Type                                                                 | Required | Default | Description                                                                                                                                                                              |
| ------------- | -------------------------------------------------------------------- | -------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `defaults`    | `Partial<Props>`                                                     | no       | `{}`    | Lowest-precedence prop bag. Merged in before content / resolveData / slots.                                                                                                              |
| `resolveData` | `(ctx: ResolveContext) => Partial<Props> \| Promise<Partial<Props>>` | no       | n/a     | Sync or async transform. Runs once per page during `resolveExperience` (before render); does not re-run on viewport changes. Receives `{ content, design (raw envelopes), experience }`. |
| `component`   | `ComponentType<Props>`                                               | yes      | n/a     | The React component. Receives the merged **content** prop bag. Reads design via `useDesignValues()`; runtime context and raw payload via `useExperience()` / `useContentfulComponent()`. |

### `defineTemplate<Props>(config)`

Same shape as `defineComponent`. The `component` also receives a fixed `children: ReactNode` (the rendered experience nodes), so templates wrap the page-level chrome around them.

| Field         | Type                                                                 | Required | Default | Description                                                                                 |
| ------------- | -------------------------------------------------------------------- | -------- | ------- | ------------------------------------------------------------------------------------------- |
| `defaults`    | `Partial<Props>`                                                     | no       | `{}`    | Same as components.                                                                         |
| `resolveData` | `(ctx: ResolveContext) => Partial<Props> \| Promise<Partial<Props>>` | no       | n/a     | Same as components. Runs once per render against the template's `props`.                    |
| `component`   | `ComponentType<Props & { children?: ReactNode }>`                    | yes      | n/a     | Receives the merged content props plus `children`. Reads context/design via the same hooks. |

### `useDesignValues<T>()` / `toCss(design, options?)`

`useDesignValues()` returns the current node's resolved design record (viewport-cascaded and token-resolved). The optional type argument shapes the bag as an assertion, not a runtime check. `toCss()` converts that record to a `CSSProperties` object, keeping only keys that map to a real CSS property and dropping semantic ones. See [Styling components](#styling-components).

`ToCssOptions`: `{ include?: string[]; exclude?: string[] }`, key filters applied against the original record keys.

### `useExperience()` / `useContentfulComponent()` / `useContentfulTemplate()`

Read the runtime context and raw Contentful payload from inside a component. Call them at the top of your component body; nothing is injected as props. `useExperience()` returns the `RenderContext` (below). `useContentfulComponent()` and `useContentfulTemplate()` return the raw payload escape hatch (below) or `null` outside a node/template.

### `useActiveViewport(viewports, initialViewportId?)`

React hook used internally by `ClientExperienceRenderer`. You'll rarely need it directly. Returns `{ activeViewportIndex }` and updates on `matchMedia` changes.

### `MissingComponent`

Default `renderUnknown` fallback. Visible red box when `useExperience().isPreview === true`, silent null otherwise. Override per-render via the `renderUnknown` prop on either renderer.

### `RenderContext`: what `useExperience()` returns

Every component (via `useExperience()`) and `resolveData` hook (via `ctx.experience`) sees an experience context. The shape:

| Field                 | Type                      | Available in        | Description                                                                                                                                                                                         |
| --------------------- | ------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isPreview`           | `boolean`                 | render, resolveData | True when the page is in editor / preview mode. Components can branch on this for placeholder UI.                                                                                                   |
| `metadata`            | `Record<string, unknown>` | render, resolveData | Whatever the page passed in via `resolveExperience` opts / renderer `context` prop. Free-form.                                                                                                      |
| `viewports`           | `ViewportDef[]`           | render, resolveData | All viewports declared on the experience, in cascade order. Stable for the duration of the page render.                                                                                             |
| `activeViewport`      | `ViewportDef`             | render only         | The currently active viewport, the last-matching media query or device trait. Absent in `resolveData` because it's a render-time value that would re-fire async resolvers on every viewport change. |
| `activeViewportIndex` | `number`                  | render only         | Index of `activeViewport` in `viewports`. Same caveat.                                                                                                                                              |

### `useContentfulComponent()`: the raw payload escape hatch

`useContentfulComponent()` returns the unprocessed Contentful-side input for the enclosing node: raw design envelopes, the originating `componentTypeId`, the `nodeId` if the editor supplied one, and the `resolveData` output. (`useContentfulTemplate()` is the template equivalent.)

Use it for:

- **Custom design resolution** outside the SDK's default cascade, such as emitting CSS variables or multi-brand theming.
- **Branching by `componentTypeId`** in a generic wrapper component.
- **Analytics / instrumentation** keyed off `nodeId`.
- **Debug overlays** in preview mode (a `<details>` with the raw payload).

Components see `ContentfulComponent`:

| Field             | Type                                   | Description                                                                                 |
| ----------------- | -------------------------------------- | ------------------------------------------------------------------------------------------- |
| `componentTypeId` | `string`                               | The id from `componentType.sys.urn`'s last slash-segment.                                   |
| `nodeId`          | `string \| undefined`                  | Pass-through of `node.id` from the payload when supplied; `undefined` otherwise.            |
| `content`         | `Record<string, unknown>`              | Editorial values exactly as the payload delivered them.                                     |
| `design`          | `Record<string, DesignPropValue>`      | Design-property envelopes (not viewport-resolved).                                          |
| `resolved`        | `Record<string, unknown> \| undefined` | Return value of the component's `resolveData` hook. `undefined` when no hook is registered. |

Templates see `ContentfulTemplate`, the same shape but with `templateId` instead of `componentTypeId` (and no `nodeId`).

### Merge precedence (last wins)

The component receives a flat prop bag composed in this order:

1. `defaults`, fallback values from `defineComponent`
2. `contentProperties`, editorial values from the payload
3. `resolveData()` output, your transform's return value
4. slot props, each named slot becomes a pre-rendered React subtree

So if `content.text === 'Hello'` and `defaults.text === 'Default'`, your component receives `text: 'Hello'`.

Design values are deliberately absent from this bag. They're published on context and read via `useDesignValues()`, so the SDK never spreads `cf`-prefixed or unknown keys onto your component. Runtime context and the raw payload are read the same way, through `useExperience()` and `useContentfulComponent()`, not injected.

---

## Design system stays portable

The integration boundary is the registry, not the components. Your `Button` is plain React with its own `ButtonProps`: no SDK-shaped props, no injected design. A component that only renders content stays fully SDK-agnostic and works in Storybook, in unit tests, and in unrelated apps. One that styles itself imports only the `useDesignValues()` hook, which returns `{}` outside a renderer so it degrades gracefully.

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

The SDK glue (defaults, resolvers, prop reshaping, slot binding) all lives in one file, `lib/experience-config.tsx`, so it's easy to scan and easy to change.

---

## Workspace internals

This is an Nx monorepo. You install only the framework adapter; the rest is workspace-internal.

| Folder                                                 | npm name                         | Scope                                                                                              |
| ------------------------------------------------------ | -------------------------------- | -------------------------------------------------------------------------------------------------- |
| [`packages/core`](./packages/core)                     | `@contentful/experiences-core`   | **Internal.** Runtime-neutral types + `resolveExperience`.                                         |
| [`packages/design`](./packages/design)                 | `@contentful/experiences-design` | **Internal.** Viewport math (`getValueForViewport`, `resolveDesignProperties`, `toCssMediaQuery`). |
| [`packages/client`](./packages/client)                 | `@contentful/experiences-client` | **Internal.** Experience delivery client + `fetchExperience`.                                      |
| [`packages/adapter-react`](./packages/adapter-react)   | `@contentful/experiences-react`  | **Public.** React renderer + re-exports of everything else.                                        |
| [`packages/adapter-svelte`](./packages/adapter-svelte) | `@contentful/experiences-svelte` | **Public.** Svelte 5 renderer with the same public API shape.                                      |

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
