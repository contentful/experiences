# Next.js example — Contentful Experiences

A Next.js 15 App Router app demonstrating `@contentful/experiences-react` rendering an Experience payload fetched from XDA.

## What it shows

- **Server-side fetch** via `@contentful/experience-delivery`'s `ContentfulViewDeliveryClient`. The response is structurally compatible with our `ExperiencePayload` — pass it straight to `resolveExperience`, no normalization.
- **Runtime-neutral plan resolution** with `resolveExperience` (re-exported from `@contentful/experiences-react`) — one async step walks the tree, classifies props, and runs any component-declared `resolveData` hooks in parallel.
- **SSR rendering** with `ServerExperienceRenderer` from `@contentful/experiences-react`.
- **Hydration-safe viewport seeding** — User-Agent parsed on the server, passed as `initialViewportId`, so SSR output matches the client's first paint.
- **`defineComponent` authoring** — each component file declares its props and renderer in one place; no casts, no boilerplate map wrappers.

## Run it

```sh
# From the repo root:
npm install --ignore-scripts
npm run build                 # builds the SDK packages

cd examples/nextjs
cp .env.example .env.local    # fill in SPACE_ID + CDA_TOKEN
npm run dev
```

Then visit `http://localhost:3000/<experience-id>` — the slug becomes the Experience ID passed to `client.view.getExperience`.

## File map

```
examples/nextjs/
├── app/
│   ├── layout.tsx            # root layout
│   ├── page.tsx              # index
│   └── [slug]/page.tsx       # dynamic Experience page (server component)
├── components/               # plain design-system components — no SDK imports
│   ├── Button.tsx
│   ├── Header.tsx
│   ├── Page.tsx              # used as the page-level template
│   └── Text.tsx
└── lib/
    ├── delivery-client.ts    # ContentfulViewDeliveryClient factory
    ├── detect-viewport.ts    # User-Agent → viewport-id heuristic
    └── experience-config.tsx # the integration layer (components + templates → experienceConfig)
```

## Integration pattern

The example separates **two layers**:

1. **Design-system components** (`components/Button.tsx`, `components/Header.tsx`, `components/Page.tsx`, …) are plain React. Zero `@contentful/*` imports. They work in Storybook, in unrelated apps, in unit tests — they don't know Contentful exists.
2. **The experience config** (`lib/experience-config.ts`) is the integration layer. Each `componentTypeId` key under `components` calls `defineComponent`; each `templateId` under `templates` calls `defineTemplate`. Both declare the Contentful-side prop shape, run any `defaults` / `resolveData` transforms, and render by calling the design-system component with reshaped props. The two registries compose into the single `experienceConfig` object the renderer takes.

Why split this way: the design system stays portable, and SDK-shaped concerns (defaults, async resolvers, slot binding, prop renaming) all live in one file you can scan to understand the whole integration surface.

```tsx
// components/Header.tsx — plain React, no SDK awareness
export function Header({ variant = 'h2', children }) {
  const Tag = variant;
  return <Tag>{children}</Tag>;
}
```

```tsx
// lib/experience-config.ts — adapter layer
import {
  defineComponent,
  defineTemplate,
  type Config,
} from '@contentful/experiences-react';
import { Header } from '@/components/Header';
import { Page } from '@/components/Page';

const components = {
  header: defineComponent<{ text?: string; variant?: 'h1' | 'h2' | 'h3' }>({
    defaults: { variant: 'h2', text: 'Untitled' },
    render: ({ text, variant }) => <Header variant={variant}>{text}</Header>,
  }),
  // ... other component types ...
};

const templates = {
  hi: defineTemplate<{ title?: string }>({
    defaults: { title: 'Welcome' },
    render: Page,
  }),
};

export const experienceConfig: Config = { components, templates };
```

### Merge precedence

The render fn receives a flat prop bag composed of (last-wins):

1. `defaults`            (componentConfig.defaults — fallback values)
2. `contentProperties`   (editorial values from the payload)
3. `designProperties`    (viewport-cascaded, envelope-unwrapped to scalars)
4. `resolveData()`       (return value of componentConfig.resolveData — see below)
5. slot props            (each named slot becomes a pre-rendered React subtree)
6. `experience`          ({ isPreview, metadata, viewports, activeViewport, activeViewportIndex })

So a payload like:

```json
{
  "componentType": { "sys": { "urn": ".../componentTypes/button" } },
  "contentProperties": { "text": "Click me", "url": "example.com/go" },
  "designProperties": { "type": { "type": "ManualDesignValue", "value": "primary" } },
  "slots": { "testSlot": [/* a header node */] }
}
```

reaches your `Button` render fn as (after Button's `resolveData` runs):

```ts
{ text: 'Click me', url: 'https://example.com/go', type: 'primary',
  testSlot: <RenderedHeader />, experience: {...} }
```

### `resolveData` — sync or async transforms

Each entry can declare a `resolveData` hook that derives final props from the
raw inputs. Useful for reshaping editorial fields, fetching enrichment,
localizing URLs, or any transform you'd otherwise inline in `render`. The
result is merged in **after** content + design but **before** slots and
`experience`.

```tsx
priceTag: defineComponent<PriceTagProps>({
  resolveData: async ({ content }) => ({
    formattedPrice: await formatPriceFromCatalog(content.sku),
  }),
  render: ({ formattedPrice }) => <PriceTag>{formattedPrice}</PriceTag>,
}),
```

The Next.js page calls `resolveExperience` once before rendering:

```ts
const experience = await resolveExperience(payload, experienceConfig, {
  experience: { isPreview, metadata: { slug } },
});
```

Resolvers run in parallel across nodes. Viewport resolution stays at render
time, so client-side viewport changes never re-trigger `resolveData`.

### `defineTemplate` — page-level wrappers

When a payload carries `sys.template`, the SDK looks up a matching id under
`Config.templates` and wraps the rendered nodes with the template's render fn.
Templates use the same `defaults` / `resolveData` shape as components; the
only structural difference is that the render fn always receives a fixed
`children: ReactNode` (the rendered experience) alongside its declared props.

```tsx
import { defineTemplate } from '@contentful/experiences-react';
import { Page } from './Page';

const templates = {
  hi: defineTemplate<PageProps>({
    defaults: { title: 'Welcome' },
    render: Page, // Page receives { title, children, experience }
  }),
};

export const experienceConfig: Config = { components, templates };
```

If the payload references a template id that isn't registered, the renderer
warns once and renders the nodes unwrapped — same graceful-degradation story
as missing components.

## Where the live preview / editor support fits

Live preview (postMessage from the Contentful editor iframe) lands in a separate increment with a client-component wrapper that uses `ClientExperienceRenderer` and a `useMessagingClient`-style hook. SSR + interactive editor mode are mutually exclusive — the editor mode requires `'use client'` so the message listener can attach.
