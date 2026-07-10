# Next.js example — Contentful Experiences

A Next.js 15 App Router app demonstrating `@contentful/experiences-react` rendering an Experience payload fetched from XDA.

## What it shows

- **Server-side fetch + resolve** via `fetchExperience` (re-exported from `@contentful/experiences-react`) — one async call fetches the payload from the Experience Delivery API, walks the tree, classifies props, and runs any component-declared `resolveData` hooks in parallel.
- **SSR rendering** with `ServerExperienceRenderer` from `@contentful/experiences-react`.
- **Three-line page** — `fetchExperience` → `<ServerExperienceRenderer>`. Preview mode, viewport seeding, and metadata are all optional advanced features; the minimal app needs none of them.
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

## Two routes, same data

The example ships two side-by-side routes so you can see what each SDK option buys you. They render the same Experience id; only the SDK plumbing changes.

| Route              | Page                                                             | Config                           | Demonstrates                                                                                         |
| ------------------ | ---------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `/[slug]`          | [`app/[slug]/page.tsx`](./app/[slug]/page.tsx)                   | `experience-config.tsx`          | The minimum: `fetchExperience` → `<ServerExperienceRenderer>`. 3 lines.                              |
| `/advanced/[slug]` | [`app/advanced/[slug]/page.tsx`](./app/advanced/[slug]/page.tsx) | `experience-config-advanced.tsx` | Preview mode via `?preview=true`, UA → `initialViewportId`, async `resolveData` with external fetch. |

The minimal `[slug]/page.tsx` is three functional lines:

```tsx
const experience = await fetchExperience({
  accessToken,
  spaceId,
  environmentId,
  experienceId,
  config: experienceConfig,
});
if (!experience) notFound();
return <ServerExperienceRenderer experience={experience} config={experienceConfig} />;
```

Slug-to-ID mapping is left to the customer — see the SDK roadmap in [`AGENTS.md`](../../AGENTS.md) for the longer-term direction.

## File map

```
examples/nextjs/
├── app/
│   ├── layout.tsx                       # root layout
│   ├── page.tsx                         # index — links to both demo routes
│   ├── [slug]/page.tsx                  # SIMPLE — 3-line page
│   └── advanced/[slug]/page.tsx         # ADVANCED — preview, UA seeding, async resolveData
├── components/                          # plain design-system components — no SDK imports
│   ├── Button.tsx
│   ├── Header.tsx
│   ├── Page.tsx                         # used as the page-level template
│   └── Text.tsx
└── lib/
    ├── detect-viewport.ts               # User-Agent → viewport id (used by the advanced route)
    ├── experience-config.tsx            # the integration layer for /[slug]
    └── experience-config-advanced.tsx   # the integration layer for /advanced/[slug] — async fetch + metadata-aware
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
import { defineComponent, defineTemplate, type Config } from '@contentful/experiences-react';
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

1. `defaults` (componentConfig.defaults — fallback values)
2. `contentProperties` (editorial values from the payload)
3. `designProperties` (viewport-cascaded, envelope-unwrapped to scalars)
4. `resolveData()` (return value of componentConfig.resolveData — see below)
5. slot props (each named slot becomes a pre-rendered React subtree)
6. `experience` ({ isPreview, metadata, viewports, activeViewport, activeViewportIndex })

So a payload like:

```json
{
  "componentType": { "sys": { "urn": ".../componentTypes/button" } },
  "contentProperties": { "text": "Click me", "url": "example.com/go" },
  "designProperties": { "type": { "type": "ManualDesignValue", "value": "primary" } },
  "slots": {
    "testSlot": [
      /* a header node */
    ]
  }
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

The route calls `fetchExperience` once — it handles the API call and resolution in one step:

```ts
const experience = await fetchExperience({
  accessToken: process.env.CDA_TOKEN!,
  spaceId: process.env.SPACE_ID!,
  environmentId: 'master',
  experienceId: slug,
  config: experienceConfig,
});
```

Resolvers run in parallel across nodes. Viewport resolution stays at render
time, so client-side viewport changes never re-trigger `resolveData`.

#### Optional `context`

The `context` option passes per-render context into every component's `resolveData`
hook (and into the rendered components as `experience.*`).
Default is `{ isPreview: false, metadata: {} }` — fine for production. Add
fields when:

- **Preview mode**: `{ isPreview: true }` — `MissingComponent` renders a visible
  red box; some customer components might branch on this. Pass `preview: true`
  at the top level to also hit the preview API endpoint.
- **Per-page metadata**: `{ metadata: { slug, locale } }` — available to every
  `resolveData` for URL building, locale-aware lookups, etc.

```ts
const experience = await fetchExperience({
  accessToken: process.env.CDA_TOKEN!,
  preview: previewMode,
  spaceId: process.env.SPACE_ID!,
  environmentId: 'master',
  experienceId: slug,
  locale,
  context: { isPreview: previewMode, metadata: { slug, locale } },
  config: experienceConfig,
});
```

Pair with `<ServerExperienceRenderer initialViewportId={...}>` (User-Agent
parsed on the server) when you want SSR output to match the device's expected
viewport — otherwise the renderer defaults to `viewports[0]`.

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
