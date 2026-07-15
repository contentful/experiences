# Contentful Experiences SDK

> ⚠️ **Pre-alpha.** Not yet published to npm. APIs are unstable and will change.

A renderer SDK for Contentful's **Experience Orchestration (ExO)**. You bring a design system; the SDK takes the Experience payload from the Experience Delivery API (XDA) and renders it.

```sh
npm install @contentful/experiences-react
```

That's the only SDK package customers install — it re-exports everything you need (resolver, types, renderer, design utilities, and the experience delivery client). The `@contentful/experiences-core`, `@contentful/experiences-design`, and `@contentful/experiences-client` packages are workspace-internal implementation details.

A Svelte adapter (`@contentful/experiences-svelte`) ships in parallel with the same public-API shape; see [`packages/adapter-svelte`](./packages/adapter-svelte). The rest of this README focuses on React.

---

## Getting started — the simple path

Three steps: register your components, fetch + resolve, render. The minimal page is one `fetchExperience` call feeding one `<ServerExperienceRenderer>`.

### 1. Register your components and (optional) templates

```tsx
// lib/experience-config.tsx
import {
  defineComponent,
  defineTemplate,
  type Components,
  type Config,
  type Templates,
} from '@contentful/experiences-react';

import { Button, type ButtonProps } from './components/Button';
import { Header, type HeaderProps } from './components/Header';
import { Page, type PageProps } from './components/Page';

const components: Components = {
  // Keys match the segment after the last slash in `componentType.sys.urn`.
  // Example URN: crn:contentful:::experience:spaces/$self/environments/$self/componentTypes/button
  button: defineComponent<ButtonProps>({
    defaults: { type: 'primary' },
    render: Button,
  }),
  header: defineComponent<HeaderProps>({
    defaults: { variant: 'h2' },
    render: Header,
  }),
};

const templates: Templates = {
  // Optional. Keys match `payload.sys.template.sys.urn` last-segment.
  page: defineTemplate<PageProps>({
    defaults: { title: 'Untitled' },
    render: Page,
  }),
};

export const experienceConfig: Config = { components, templates };
```

### 2. Fetch + resolve + render (server-side)

```tsx
// app/[slug]/page.tsx (Next.js App Router)
import { notFound } from 'next/navigation';
import {
  fetchExperience,
  NotFoundError,
  ServerExperienceRenderer,
} from '@contentful/experiences-react';
import { experienceConfig } from '@/lib/experience-config';

export default async function ExperiencePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const experience = await fetchExperience(
      { spaceId: process.env.SPACE_ID!, environmentId: 'master', experienceId: slug },
      { accessToken: process.env.CDA_TOKEN! },
      { config: experienceConfig }
    );
    return <ServerExperienceRenderer experience={experience} config={experienceConfig} />;
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
}
```

`fetchExperience` fetches the payload from the Experience Delivery API and resolves it in one call — the renderer walks the payload, resolves design properties to plain scalars, runs any `resolveData` hooks (in parallel), and dispatches each node to your registered React component.

The signature is three grouped params: **what to fetch** (space/env/experience), **how to fetch** (auth), **how to resolve** (component config + per-render context). Each grouping evolves independently — future personalization params, digital-property identifiers, and transport options fit their respective group without cross-cutting the signature.

A working version is at [`examples/nextjs/app/[slug]/page.tsx`](./examples/nextjs/app/[slug]/page.tsx).

---

## Advanced setup

When the simple path isn't enough, three knobs cover most production needs: **preview mode + metadata** (per-page context flowing into resolvers), **viewport seeding** (SSR matches the device), **async `resolveData`** (enrich props from external sources). All optional. Mix and match.

A full working advanced route is at [`examples/nextjs/app/advanced/[slug]/page.tsx`](./examples/nextjs/app/advanced/[slug]/page.tsx) — visit `/advanced/<id>?preview=true&locale=en-US` after running the example.

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

Each `defineComponent` entry can declare an async `resolveData` that derives final props from external sources. The SDK fans these out across all nodes via `Promise.all`, so a slow resolver doesn't block its peers.

**When does it run?** Once per page render, inside `resolveExperience(payload, config, opts?)` — _before_ the renderer mounts. By the time `<ServerExperienceRenderer>` walks the tree, every `resolveData` has already settled and its return value is sitting on `node.props.resolved`. Resolvers do **not** re-run on viewport changes, prop changes, or client-side navigation — re-fetch by re-calling `resolveExperience` (typically a fresh server request).

```tsx
button: defineComponent<ButtonProps>({
  resolveData: async ({ content, experience }) => {
    const { formattedText } = await fetchEnrichment(content.text as string);
    return {
      text: formattedText,
      url: `/${experience.metadata.locale}/${experience.metadata.slug}`,
    };
  },
  render: Button,
}),
```

`experience.metadata` here is exactly what the page passed into `resolveExperience`'s third argument — that's how per-page context reaches every resolver.

---

## API reference

### `fetchExperience(experienceOptions, clientOptions, resolveOptions)`

Async. Fetches an Experience from the Experience Delivery API and resolves it in one call — equivalent to fetching the payload yourself and then calling `resolveExperience`. Returns a `PortableRenderPlan`.

Three positional args map to three concerns that evolve independently:

| Arg                 | Type                                                | Purpose                                                                                                 |
| ------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `experienceOptions` | `{ spaceId, environmentId, experienceId, locale? }` | Which Experience to fetch. Future digital-property identifiers widen this type.                         |
| `clientOptions`     | `{ accessToken, host? }` **or** `{ client }`        | How to fetch. Discriminated union — pass creds inline or bring your own `ContentfulViewDeliveryClient`. |
| `resolveOptions`    | `{ config, context? }`                              | How to resolve. `context` flows into every `resolveData` hook as `ctx.experience`.                      |

`host` is a full base-URL string (e.g. `'https://preview.xdn.contentful.com'` for the preview API). When omitted, the delivery client's default endpoint is used.

```ts
// Inline credentials — client created internally
const plan = await fetchExperience(
  { spaceId: '...', environmentId: 'master', experienceId: slug, locale: 'en-US' },
  { accessToken: process.env.CDA_TOKEN!, host: 'https://preview.xdn.contentful.com' },
  { config: experienceConfig, context: { isPreview: true, metadata: { slug } } }
);

// Pre-created client — useful when you manage the client lifecycle yourself
import { createClient } from '@contentful/experiences-react';
const client = createClient({ accessToken: process.env.CDA_TOKEN! });
const plan = await fetchExperience(
  { spaceId, environmentId, experienceId },
  { client },
  { config: experienceConfig }
);
```

**Error handling.** The underlying delivery client throws `NotFoundError` (re-exported from the adapter) when the Experience ID doesn't exist, plus `UnauthorizedError`, `ForbiddenError`, etc. on other 4xx/5xx responses. An Experience with no published nodes is **not** a 404 — it resolves to a valid `PortableRenderPlan` with `nodes: []` (draft / unpublished / empty-locale content). Route the missing-experience case to your framework's 404 idiom:

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

Functional constructor over `ContentfulViewDeliveryClient` for the SDK's option shape — maps `accessToken → token` and `host → baseUrl`, passes everything else through. Prefer this over `new ContentfulViewDeliveryClient({...})` so field names stay consistent with `fetchExperience`'s inline-creds path.

```ts
import { createClient } from '@contentful/experiences-react';

const client = createClient({
  accessToken: process.env.CDA_TOKEN!,
  host: 'https://preview.xdn.contentful.com', // optional — overrides the default endpoint
  // headers, timeoutInSeconds, maxRetries, fetch, logging, etc. all pass through
});
```

### `resolveExperience(payload, config, opts?)`

Async. Walks the payload, classifies properties, runs every component's `resolveData` in parallel, and returns a `PortableRenderPlan` ready to hand to a renderer.

| Param     | Type                                                                              | Required | Default | Description                                                                                                                                                           |
| --------- | --------------------------------------------------------------------------------- | -------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `payload` | `ExperiencePayload` — XDA response (or any structurally-compatible object)        | yes      | —       | The Experience payload to resolve.                                                                                                                                    |
| `config`  | `Config` — `{ components, templates? }` from `defineComponent` / `defineTemplate` | yes      | —       | Your component + template registry.                                                                                                                                   |
| `opts`    | `{ experience?: Partial<ExperienceContext> }`                                     | no       | `{}`    | Per-render context shallow-merged into the default `{ isPreview: false, metadata: {} }`. The merged context is what every `resolveData` receives as `ctx.experience`. |

### `<ServerExperienceRenderer />`

SSR-friendly renderer. No reactive subscriptions; the active viewport is resolved once from `initialViewportId`. Safe to use in React Server Components.

| Prop                | Type                                          | Required | Default                              | Description                                                                                            |
| ------------------- | --------------------------------------------- | -------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `experience`        | `PortableRenderPlan`                          | yes      | —                                    | The resolved plan from `fetchExperience` or `resolveExperience`. An empty-nodes plan renders nothing.  |
| `config`            | `Config`                                      | yes      | —                                    | Same registry passed to `resolveExperience`. Looked up at render time for dispatch.                    |
| `initialViewportId` | `string`                                      | no       | First viewport id                    | Seeds the active viewport. Typically derived from User-Agent server-side.                              |
| `context`           | `Partial<ExperienceContext>`                  | no       | `{ isPreview: false, metadata: {} }` | Shallow-merged into the render-time `experience` context customer components receive.                  |
| `renderUnknown`     | `(props: MissingComponentProps) => ReactNode` | no       | `MissingComponent`                   | Fallback for unregistered component types. Default: visible red box in preview, silent null otherwise. |

### `<ClientExperienceRenderer />` (alias: `<ExperienceRenderer />`)

Client-side renderer with reactive viewport tracking via `window.matchMedia`. Use in `'use client'` components. Throws if rendered on the server. Same prop shape as `ServerExperienceRenderer`.

### `defineComponent<Props>(config)`

Identity helper that narrows `resolveData` and `render` parameter types to your declared `Props`.

| Field         | Type                                                                 | Required | Default | Description                                                                                                                                                                                                                                        |
| ------------- | -------------------------------------------------------------------- | -------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `defaults`    | `Partial<Props>`                                                     | no       | `{}`    | Lowest-precedence prop bag. Merged in before content / design / resolveData / slots / experience.                                                                                                                                                  |
| `resolveData` | `(ctx: ResolveContext) => Partial<Props> \| Promise<Partial<Props>>` | no       | —       | Sync or async transform. Runs once per page during `resolveExperience` (before render); does not re-run on viewport changes. Receives `{ content, design (raw envelopes), experience }`; returns a partial prop bag merged after content + design. |
| `render`      | `(props: ComponentProps<Props>) => ReactNode`                        | yes      | —       | The component's render function. Receives a flat prop bag plus `experience: RenderContext` and `contentful: ContentfulComponent` (raw Contentful payload — see below).                                                                             |

### `defineTemplate<Props>(config)`

Same shape as `defineComponent`. The `render` fn additionally receives a fixed `children: ReactNode` (the rendered experience nodes) — templates wrap the page-level chrome around them.

| Field         | Type                                                                 | Required | Default | Description                                                                                         |
| ------------- | -------------------------------------------------------------------- | -------- | ------- | --------------------------------------------------------------------------------------------------- |
| `defaults`    | `Partial<Props>`                                                     | no       | `{}`    | Same as components.                                                                                 |
| `resolveData` | `(ctx: ResolveContext) => Partial<Props> \| Promise<Partial<Props>>` | no       | —       | Same as components. Runs once per render against the template's `props`.                            |
| `render`      | `(props: TemplateProps<Props>) => ReactNode`                         | yes      | —       | Receives `{ ...props, children, experience, contentful }` (where `contentful: ContentfulTemplate`). |

### `useActiveViewport(viewports, initialViewportId?)`

React hook used internally by `ClientExperienceRenderer`. Customers rarely need it directly. Returns `{ activeViewportIndex }` and updates on `matchMedia` changes.

### `MissingComponent`

Default `renderUnknown` fallback. Visible red box when `experience.isPreview === true`, silent null otherwise. Override per-render via the `renderUnknown` prop on either renderer.

### `RenderContext` — what `experience.*` carries

Every customer component and `resolveData` hook sees an `experience` context. The shape:

| Field                 | Type                      | Available in        | Description                                                                                                                                                                                       |
| --------------------- | ------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isPreview`           | `boolean`                 | render, resolveData | True when the page is in editor / preview mode. Components can branch on this for placeholder UI.                                                                                                 |
| `metadata`            | `Record<string, unknown>` | render, resolveData | Whatever the page passed in via `resolveExperience` opts / renderer `context` prop. Free-form.                                                                                                    |
| `viewports`           | `ViewportDef[]`           | render, resolveData | All viewports declared on the experience, in cascade order. Stable for the duration of the page render.                                                                                           |
| `activeViewport`      | `ViewportDef`             | render only         | The currently active viewport — last-matching media query / device trait. **Not** in `resolveData` because it's a render-time concept and would re-fire async resolvers on every viewport change. |
| `activeViewportIndex` | `number`                  | render only         | Index of `activeViewport` in `viewports`. Same caveat.                                                                                                                                            |

### `contentful` prop — the raw payload escape hatch

Every customer component (and template) receives a `contentful` prop alongside the merged props and the `experience` context. It's the unprocessed Contentful-side input: raw design envelopes, the originating `componentTypeId`, the `nodeId` if the editor supplied one, and the `resolveData` output.

Use it for:

- **Custom design resolution** outside the SDK's default cascade (e.g. emitting CSS variables, multi-brand theming).
- **Branching by `componentTypeId`** in a generic wrapper component.
- **Analytics / instrumentation** keyed off `nodeId`.
- **Debug overlays** in preview mode (`<details>` with the raw payload).

Components see `ContentfulComponent`:

| Field             | Type                                   | Description                                                                                 |
| ----------------- | -------------------------------------- | ------------------------------------------------------------------------------------------- |
| `componentTypeId` | `string`                               | The id from `componentType.sys.urn`'s last slash-segment.                                   |
| `nodeId`          | `string \| undefined`                  | Pass-through of `node.id` from the payload when supplied; `undefined` otherwise.            |
| `content`         | `Record<string, unknown>`              | Editorial values exactly as the payload delivered them.                                     |
| `design`          | `Record<string, DesignPropValue>`      | Design-property envelopes (NOT viewport-resolved).                                          |
| `resolved`        | `Record<string, unknown> \| undefined` | Return value of the component's `resolveData` hook. `undefined` when no hook is registered. |

Templates see `ContentfulTemplate` — the same shape but with `templateId` instead of `componentTypeId` (and no `nodeId`).

### Merge precedence (last wins)

The render fn receives a flat prop bag composed in this order:

1. `defaults` — fallback values from `defineComponent`
2. `contentProperties` — editorial values from the payload
3. `designProperties` — viewport-cascaded, envelope-unwrapped to scalars
4. `resolveData()` output — your transform's return value
5. slot props — each named slot becomes a pre-rendered React subtree
6. `experience` — the `RenderContext` above
7. `contentful` — the raw payload escape hatch (see below)

So if `content.text === 'Hello'` and `defaults.text === 'Default'`, your component receives `text: 'Hello'`.

---

## Design system stays portable

The integration boundary is **the registry, not the components**. Your `Button` component is plain React with its own `ButtonProps` — no `@contentful/*` imports, no SDK awareness. It works in Storybook, in unrelated apps, in unit tests.

```tsx
// components/Button.tsx — plain React, zero SDK coupling
export interface ButtonProps {
  text?: string;
  url?: string;
  type?: 'primary' | 'secondary';
}

export function Button({ text, url, type = 'primary' }: ButtonProps) {
  /* … */
}
```

The SDK glue (defaults, resolvers, prop reshaping, slot binding) all lives in one file: `lib/experience-config.tsx`. Easy to scan, easy to change.

---

## Workspace internals

This is an Nx monorepo. Customers install only the framework adapter; the rest is workspace-internal.

| Folder                                                 | npm name                         | Audience                                                                                           |
| ------------------------------------------------------ | -------------------------------- | -------------------------------------------------------------------------------------------------- |
| [`packages/core`](./packages/core)                     | `@contentful/experiences-core`   | **Internal.** Runtime-neutral types + `resolveExperience`.                                         |
| [`packages/design`](./packages/design)                 | `@contentful/experiences-design` | **Internal.** Viewport math (`getValueForViewport`, `resolveDesignProperties`, `toCssMediaQuery`). |
| [`packages/client`](./packages/client)                 | `@contentful/experiences-client` | **Internal.** Experience delivery client + `fetchExperience`.                                      |
| [`packages/adapter-react`](./packages/adapter-react)   | `@contentful/experiences-react`  | **Customer-facing.** React renderer + re-exports of everything else.                               |
| [`packages/adapter-svelte`](./packages/adapter-svelte) | `@contentful/experiences-svelte` | **Customer-facing.** Svelte 5 renderer with the same public API shape.                             |

Future framework adapters slot in under the same pattern (`packages/adapter-vue`, `packages/adapter-angular`, …) and consume the same internal core + design packages.

```sh
npm install --ignore-scripts        # husky prepare can fail in fresh clones; safe to skip

npm run build                       # nx run-many -t build (topological)
npm test                            # nx run-many -t test
npm run lint                        # nx run-many -t lint
npm run typecheck                   # nx run-many -t typecheck
npx nx graph                        # visual dep graph
npm run release:dry                 # rehearse independent release
```

For deeper context — design decisions, multi-framework architecture notes, conventions, gotchas — see [`AGENTS.md`](./AGENTS.md).

---

## Contributing

Contributions are welcome. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for development setup, coding standards, and the PR process, and our [Code of Conduct](https://github.com/contentful/.github/blob/master/CODE_OF_CONDUCT.md).

## Support

For usage questions and support, [visit the Contentful support center](https://support.contentful.com/hc/en-us). Use [GitHub issues](https://github.com/contentful/experiences/issues) for bugs and feature requests.

## License

MIT. See [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE).
