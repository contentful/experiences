# Next.js example: Contentful Experiences

A Next.js 15 App Router app demonstrating `@contentful/experiences-react` rendering an Experience payload fetched from XDA.

## What it shows

- **Server-side fetch and resolve** via `fetchExperience` (re-exported from `@contentful/experiences-react`). One async call fetches the payload from the Experience Delivery API, walks the tree, classifies props, and runs any component-declared `resolveData` hooks in parallel.
- **SSR rendering** with `ServerExperienceRenderer` from `@contentful/experiences-react`.
- **Preview mode via `?preview=true`**: `fetchExperience` accepts both a delivery `accessToken` and a `previewToken`; flipping `preview: true` at request time swaps the token and endpoint together. This is purely a fetch concern (which token + host) — independent of `debug`.
- **Debug mode via `?debug=true`**: the top-level `debug` flag turns on verbose SDK logging, flips `MissingComponent` to a visible box, and auto-mounts `<DebugExperience>` (a collapsible JSON dump of the resolved plan) after the tree.
- **User-Agent → viewport seeding** so SSR renders at the device's expected viewport (avoids hydration drift on the client renderer's first paint).
- **Async `resolveData` with external fetch**: the `card` component demonstrates enrichment (fake catalog lookup) plus metadata-aware URL rewriting; resolvers run in parallel across nodes.
- **Styling via `useDesignValues()` and `toCss()`**: components read their own design (spacing, color, typography, layout) from the hook; design is never injected as props. `Section`, `Heading`, `Text`, `Button`, `Image`, and `RichText` all follow this pattern.
- **Design tokens**: `lib/experience-config.tsx` wires a `resolveToken` that maps token ids (`size.xl`, `color.text`, and so on) to CSS values from `lib/design-tokens.ts`.
- **Component registration**: bare components for the common case, `defineComponent({...})` when a component needs `defaults` or `resolveData`.

## Run it

The example is a real integration against Contentful, not a mock. You need:

1. **A Contentful space** with the demo content model + Experience seeded into it (a one-time step below), and
2. **Tokens** for the paths you want to hit — different Contentful APIs use different tokens.

The [`examples/scripts/bootstrap-example.ts`](../scripts/bootstrap-example.ts) script does the seeding via the management API. See [`examples/scripts/README.md`](../scripts/README.md) for what it provisions.

### 1. Seed the demo Experience (one-time)

```sh
# From the repo root:
npm install
npm run build                          # build the SDK packages

cd examples/scripts
cp .env.example .env                   # fill in SPACE_ID, ENVIRONMENT_ID, CMA_TOKEN
npm run bootstrap                      # prints the experienceId at the end (default: `landing`)
```

### 2. Run the app

```sh
cd ../nextjs
cp .env.example .env.local             # fill in SPACE_ID, ENVIRONMENT_ID, CDA_TOKEN
npm run dev
```

Visit `http://localhost:3000/landing`. The route calls `fetchExperience` → `<ServerExperienceRenderer>`, reading from the Content Delivery API using `CDA_TOKEN`.

### Optional: preview mode

Append `?preview=true` to any experience URL to read from the Content Preview API (`preview.xdn.contentful.com`) instead. Preview requires a **Content Preview API token** — the CDA token is rejected by that host.

Add it to `.env.local`:

```
CPA_TOKEN=...   # Content Preview API token, from Settings → API keys in your space
```

Then visit `http://localhost:3000/landing?preview=true&locale=en-US`.

The route wires this through `fetchExperience`'s client options — both tokens are passed up front and `preview: previewMode` selects which one to use per request. See the snippet in [The route](#the-route) below.

### Tokens summary

| Token       | API                | Used by                              | Required?             |
| ----------- | ------------------ | ------------------------------------ | --------------------- |
| `CMA_TOKEN` | Content Management | The bootstrap script (one-time seed) | Yes, to run bootstrap |
| `CDA_TOKEN` | Content Delivery   | The example app                      | Yes, to run the app   |
| `CPA_TOKEN` | Content Preview    | The example app when `?preview=true` | Only for preview mode |

## The route

One dynamic `/[slug]` route. `fetchExperience` reads the payload from XDA, `<ServerExperienceRenderer>` renders it. Preview mode, debug mode, viewport seeding, and per-page metadata are all wired up as `searchParams` + header reads.

| Try it locally                                          | Source                                         | Config                                                     |
| ------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| `http://localhost:3000/landing`                         | [`app/[slug]/page.tsx`](./app/[slug]/page.tsx) | [`lib/experience-config.tsx`](./lib/experience-config.tsx) |
| `http://localhost:3000/landing?debug=true&locale=en-US` | same route                                     | same config                                                |

The route in one glance:

```tsx
const experience = await fetchExperience(
  { spaceId, environmentId, experienceId, locale },
  {
    accessToken: CDA_TOKEN,
    previewToken: CPA_TOKEN,
    preview: previewMode,
  },
  {
    config: experienceConfig,
    metadata: { slug, locale },
    debug,
  }
);
return (
  <ServerExperienceRenderer
    experience={experience}
    config={experienceConfig}
    initialViewportId={initialViewportId}
    metadata={{ slug, locale }}
    debug={debug}
  />
);
```

An empty-nodes payload (draft, unpublished, or empty locale) resolves to a plan with `nodes: []` and renders as an empty page — not a 404.

Slug-to-ID mapping is up to you. See the SDK roadmap in [`AGENTS.md`](../../AGENTS.md) for the longer-term direction.

## File map

```
examples/nextjs/
├── app/
│   ├── layout.tsx                       # root layout
│   ├── page.tsx                         # index; links to the demo experience
│   └── [slug]/page.tsx                  # fetch + render + 404, preview, UA seeding, metadata
├── components/                          # design-system components; read design via useDesignValues()
│   ├── Section.tsx                      # flex/grid layout primitive
│   ├── Heading.tsx
│   ├── Text.tsx
│   ├── RichText.tsx                     # minimal rich-text renderer
│   ├── Image.tsx
│   ├── Button.tsx
│   └── Page.tsx                         # used as the page-level template
└── lib/
    ├── design-tokens.ts                 # token id to CSS value table (used by resolveToken)
    ├── detect-viewport.ts               # User-Agent to viewport id
    └── experience-config.tsx            # the integration layer: component registry + async resolveData + tokens
```

## Integration pattern

The example separates **two layers**:

1. **Design-system components** (`components/Section.tsx`, `components/Heading.tsx`, …) receive their **content** props (`text`, `label`, `src`) and read design themselves via `useDesignValues()`. They import nothing SDK-shaped beyond that hook, and it returns `{}` outside a renderer, so they degrade gracefully.
2. **The experience config** (`lib/experience-config.tsx`) is the integration layer: it maps each `componentTypeId` to a component (bare, or `defineComponent({...})` for `defaults` / `resolveData`), maps `templateId`s under `templates`, and wires `resolveToken`. It composes into the single `experienceConfig` object the renderer takes.

Why split this way: SDK-shaped concerns (registration, defaults, async resolvers, token resolution) all live in one file you can scan to understand the whole integration surface.

```tsx
// components/Heading.tsx: content prop + design read from the hook
'use client';
import { toCss, useDesignValues } from '@contentful/experiences-react';

export function Heading({ text }: { text?: string }) {
  const design = useDesignValues<{ as?: 'h1' | 'h2' | 'h3' }>();
  const Tag = design.as ?? 'h2'; // semantic key, read by name
  return <Tag style={toCss(design)}>{text}</Tag>; // toCss keeps CSS-shaped keys
}
```

```tsx
// lib/experience-config.tsx: adapter layer
import { defineComponent, type Config, type ResolveToken } from '@contentful/experiences-react';
import { Heading } from '@/components/Heading';
import { Page } from '@/components/Page';
import { designTokens } from '@/lib/design-tokens';

const components = {
  Heading: defineComponent<{ text?: string }>({
    defaults: { text: 'Untitled' },
    component: Heading,
  }),
  // ... other component types (bare or config) ...
};

const templates = { page: Page };

const resolveToken: ResolveToken = (token) => designTokens[token.value];

export const experienceConfig: Config = { components, templates, resolveToken };
```

### Merge precedence

The component receives a flat set of props composed of (last-wins):

1. `defaults` (componentConfig.defaults, fallback values)
2. `contentProperties` (editorial values from the payload)
3. `resolveData()` (return value of componentConfig.resolveData, see below)
4. slot props (each named slot becomes a pre-rendered React subtree)

Design values are **not** included here; they're read via `useDesignValues()`. So a payload like:

```json
{
  "componentType": { "sys": { "urn": ".../componentTypes/Button" } },
  "contentProperties": { "label": "Click me", "url": "example.com/go" },
  "designProperties": { "target": { "type": "ManualDesignValue", "value": "_self" } }
}
```

reaches your `Button` as `{ label: 'Click me', url: 'https://example.com/go' }` (after its `resolveData` runs), while `useDesignValues()` returns `{ target: '_self' }`.

### `resolveData`: sync or async transforms

Each entry can declare a `resolveData` hook that derives final props from the
raw inputs. Useful for reshaping editorial fields, fetching enrichment, or
localizing URLs. The result is merged in **after** content but **before**
slots.

```tsx
PriceTag: defineComponent<PriceTagProps>({
  resolveData: async ({ content }) => ({
    formattedPrice: await formatPriceFromCatalog(content.sku),
  }),
  component: PriceTag,
}),
```

The route calls `fetchExperience` once, and it handles the API call and resolution in one step:

```ts
const experience = await fetchExperience(
  { spaceId: process.env.SPACE_ID!, environmentId: 'master', experienceId: slug },
  { accessToken: process.env.CDA_TOKEN! },
  { config: experienceConfig }
);
```

Resolvers run in parallel across nodes. Viewport resolution stays at render
time, so client-side viewport changes never re-trigger `resolveData`.

#### Optional `metadata` + `debug`

Two top-level `resolveOptions` (the third arg) tune resolve + render. Both are
optional and default off; production usually needs neither.

- **Per-page metadata**: `metadata: { slug, locale }` is passed into every
  component's `resolveData` hook (as `ctx.experience.metadata`) and readable at
  render time via `useExperience().metadata` — for URL building, locale-aware
  lookups, and so on.
- **Debug mode**: `debug: true` turns on verbose SDK logging, flips
  `MissingComponent` to a visible box, and auto-mounts `<DebugExperience>`. It's
  independent of `preview` (which selects the delivery vs. preview token + host);
  configure both tokens on `clientOptions` and flip `preview: true` for that.

```ts
const experience = await fetchExperience(
  { spaceId: process.env.SPACE_ID!, environmentId: 'master', experienceId: slug, locale },
  {
    accessToken: process.env.CDA_TOKEN!,
    previewToken: process.env.CPA_TOKEN,
    preview: previewMode,
  },
  {
    config: experienceConfig,
    metadata: { slug, locale },
    debug,
  }
);
```

Pair with `<ServerExperienceRenderer initialViewportId={...}>` (User-Agent
parsed on the server) when you want SSR output to match the device's expected
viewport. Otherwise the renderer defaults to `viewports[0]`.

### `defineTemplate`: page-level wrappers

When a payload carries `sys.template`, the SDK looks up a matching id under
`Config.templates` and wraps the rendered nodes with the template's component.
Templates use the same `defaults` / `resolveData` shape as components; the
only structural difference is that the component always receives a fixed
`children: ReactNode` (the rendered experience) alongside its declared props.

```tsx
import { defineTemplate } from '@contentful/experiences-react';
import { Page } from './Page';

const templates = {
  // bare component, or defineTemplate({...}) for defaults / resolveData
  page: defineTemplate<PageProps>({
    defaults: { title: 'Welcome' },
    component: Page, // Page receives { title, children }
  }),
};

export const experienceConfig: Config = { components, templates };
```

If the payload references a template id that isn't registered, the renderer
warns once and renders the nodes unwrapped, the same graceful-degradation
behavior as missing components.
