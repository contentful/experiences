# Next.js example: Contentful Experiences

A Next.js 15 App Router app demonstrating `@contentful/experiences-react` rendering an Experience payload fetched from XDA.

## What it shows

- **Server-side fetch and resolve** via `fetchExperience` (re-exported from `@contentful/experiences-react`). One async call fetches the payload from the Experience Delivery API, walks the tree, classifies props, and runs any component-declared `resolveData` hooks in parallel.
- **SSR rendering** with `ServerExperienceRenderer` from `@contentful/experiences-react`.
- **Minimal page**: `fetchExperience` feeding `<ServerExperienceRenderer>`, wrapped in a try/catch that routes `NotFoundError` to Next's `notFound()`. Preview mode, debug mode, viewport seeding, and metadata are all optional advanced features; the minimal app needs none of them.
- **Styling via `useDesignValues()` and `toCss()`**: components read their own design (spacing, color, typography, layout) from the hook; design is never injected as props. `Section`, `Heading`, `Text`, `Button`, `Image`, and `RichText` all follow this pattern.
- **Design tokens**: `lib/experience-config.tsx` wires a `resolveToken` that maps token ids (`size.xl`, `color.text`, and so on) to CSS values from `lib/design-tokens.ts`.
- **Component registration**: bare components for the common case, `defineComponent({...})` when a component needs `defaults` or `resolveData`.

## Run it

```sh
# From the repo root:
npm install --ignore-scripts
npm run build                 # builds the SDK packages

cd examples/nextjs
cp .env.example .env.local    # fill in SPACE_ID + CDA_TOKEN
npm run dev
```

Then visit `http://localhost:3000/<experience-id>`. The slug becomes the Experience ID passed to `client.view.getExperience`.

## Two routes, same data

The example ships two side-by-side routes so you can see what each SDK option gives you. They render the same Experience id; only the SDK setup changes.

| Route              | Page                                                             | Config                           | Demonstrates                                                                                                         |
| ------------------ | ---------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `/[slug]`          | [`app/[slug]/page.tsx`](./app/[slug]/page.tsx)                   | `experience-config.tsx`          | The minimum: `fetchExperience` into `<ServerExperienceRenderer>` with `NotFoundError` routed to Next's `notFound()`. |
| `/advanced/[slug]` | [`app/advanced/[slug]/page.tsx`](./app/advanced/[slug]/page.tsx) | `experience-config-advanced.tsx` | Preview mode via `?preview=true`, User-Agent to `initialViewportId`, async `resolveData` with external fetch.        |

The minimal `[slug]/page.tsx`:

```tsx
try {
  const experience = await fetchExperience(
    { spaceId, environmentId, experienceId },
    { accessToken },
    { config: experienceConfig }
  );
  return <ServerExperienceRenderer experience={experience} config={experienceConfig} />;
} catch (err) {
  if (err instanceof NotFoundError) notFound();
  throw err;
}
```

`NotFoundError` is thrown by the delivery client on 404 (Experience ID doesn't exist). An empty-nodes payload (draft, unpublished, or empty locale) is **not** a 404; it resolves to a plan with `nodes: []` and renders as an empty page.

Slug-to-ID mapping is up to you. See the SDK roadmap in [`AGENTS.md`](../../AGENTS.md) for the longer-term direction.

## File map

```
examples/nextjs/
├── app/
│   ├── layout.tsx                       # root layout
│   ├── page.tsx                         # index; links to both demo routes
│   ├── [slug]/page.tsx                  # SIMPLE: fetch + render + 404 handling
│   └── advanced/[slug]/page.tsx         # ADVANCED: preview, UA seeding, async resolveData
├── components/                          # design-system components; read design via useDesignValues()
│   ├── Section.tsx                      # flex/grid layout primitive
│   ├── Heading.tsx
│   ├── Text.tsx
│   ├── RichText.tsx                     # minimal rich-text renderer
│   ├── Image.tsx
│   ├── Button.tsx
│   └── Page.tsx                         # used as the page-level Experience Template
└── lib/
    ├── design-tokens.ts                 # token id to CSS value table (used by resolveToken)
    ├── detect-viewport.ts               # User-Agent to viewport id (used by the advanced route)
    ├── experience-config.tsx            # the integration layer for /[slug]
    └── experience-config-advanced.tsx   # the integration layer for /advanced/[slug]; async fetch + metadata-aware
```

## Integration pattern

The example separates **two layers**:

1. **Design-system components** (`components/Section.tsx`, `components/Heading.tsx`, …) receive their **content** props (`text`, `label`, `src`) and read design themselves via `useDesignValues()`. They import nothing SDK-shaped beyond that hook, and it returns `{}` outside a renderer, so they degrade gracefully.
2. **The experience config** (`lib/experience-config.tsx`) is the integration layer: it maps each `componentId` to a component (bare, or `defineComponent({...})` for `defaults` / `resolveData`), maps `experienceTemplateId`s under `experienceTemplates`, and wires `resolveToken`. It composes into the single `experienceConfig` object the renderer takes.

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

const experienceTemplates = { page: Page };

const resolveToken: ResolveToken = (token) => designTokens[token.value];

export const experienceConfig: Config = { components, experienceTemplates, resolveToken };
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
  "component": { "sys": { "urn": ".../components/Button" } },
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
  independent of the fetch host; set `host` on `clientOptions` to hit the preview
  API.

```ts
const experience = await fetchExperience(
  { spaceId: process.env.SPACE_ID!, environmentId: 'master', experienceId: slug, locale },
  {
    accessToken: process.env.CDA_TOKEN!,
    host: previewMode ? 'https://preview.xdn.contentful.com' : 'https://xdn.contentful.com',
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

### `defineExperienceTemplate`: page-level wrappers

When a payload carries `sys.experienceTemplate`, the SDK looks up a matching id
under `Config.experienceTemplates` and wraps the rendered nodes with the
Experience Template's component. Experience Templates use the same `defaults` /
`resolveData` shape as components; the
only structural difference is that the component always receives a fixed
`children: ReactNode` (the rendered experience) alongside its declared props.

```tsx
import { defineExperienceTemplate } from '@contentful/experiences-react';
import { Page } from './Page';

const experienceTemplates = {
  // bare component, or defineExperienceTemplate({...}) for defaults / resolveData
  page: defineExperienceTemplate<PageProps>({
    defaults: { title: 'Welcome' },
    component: Page, // Page receives { title, children }
  }),
};

export const experienceConfig: Config = { components, experienceTemplates };
```

If the payload references an experience-template id that isn't registered, the renderer
warns once and renders the nodes unwrapped, the same graceful-degradation
behavior as missing components.

## Where the live preview / editor support fits

Live preview (postMessage from the Contentful editor iframe) lands in a separate increment with a client-component wrapper that uses `ClientExperienceRenderer` and a `useMessagingClient`-style hook. SSR and interactive editor mode are mutually exclusive: the editor mode requires `'use client'` so the message listener can attach.
