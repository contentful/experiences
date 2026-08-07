# Next.js test app: Contentful Experiences

A Next.js 15 App Router app demonstrating `@contentful/experiences-react` rendering an Experience payload fetched from XDA.

This app shows the integration we recommend. Design values get resolved on the server and arrive as ordinary component props, so there's no hook to call and no client-side design plumbing to wire up. If you do need the `useDesignValues()` hook, it's still there; see [Reading design on the client](#reading-design-on-the-client-optional).

## What it shows

- **Server-side fetch and resolve** via `fetchExperience` (re-exported from `@contentful/experiences-react`). One async call fetches the payload from the Experience Delivery API, walks the tree, classifies props, **pre-resolves each node's design against the target viewport**, and runs any component-declared `resolveData` hooks in parallel.
- **Design values as props (recommended)**: resolved design (spacing, color, typography, layout) is auto-filled onto each component's props alongside content, so a component styles itself from props without calling any SDK hook. Every component `console.log`s its resolved props, so you can see what it received.
- **SSR rendering** with `ServerExperienceRenderer` from `@contentful/experiences-react`. Design is resolved on the server, so the first paint is already styled correctly and there's no flash of unstyled content on hydration.
- **Preview mode via `?preview=true`**: `fetchExperience` accepts both a delivery `accessToken` and a `previewToken`; flipping `preview: true` at request time swaps the token and endpoint together. This is purely a fetch concern (which token + host) — independent of `debug`.
- **Debug mode via `?debug=true`**: the top-level `debug` flag turns on verbose SDK logging, flips `MissingComponent` to a visible box, and auto-mounts `<DebugExperience>` (a collapsible JSON dump of the resolved plan) above the tree.
- **User-Agent → viewport seeding** so SSR resolves design against the device's expected viewport, which keeps the client renderer's first paint from drifting on hydration.
- **Async `resolveData` with external fetch**: the `card` component demonstrates enrichment (fake catalog lookup) plus metadata-aware URL rewriting; resolvers run in parallel across nodes.
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
| `CDA_TOKEN` | Content Delivery   | The app                              | Yes, to run the app   |
| `CPA_TOKEN` | Content Preview    | The app when `?preview=true`         | Only for preview mode |

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
    // Resolve design against the device's expected viewport (from the UA).
    initialViewportId,
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
test-apps/nextjs/
├── app/
│   ├── layout.tsx                       # root layout
│   ├── page.tsx                         # index; links to the demo experience
│   └── [slug]/page.tsx                  # fetch + render + 404, preview, UA seeding, metadata
├── components/                          # design-system components; design arrives as props
│   ├── Section.tsx                      # flex/grid layout primitive
│   ├── Heading.tsx
│   ├── Text.tsx
│   ├── RichText.tsx                     # minimal rich-text renderer
│   ├── Image.tsx
│   ├── Button.tsx
│   ├── Card.tsx                         # image + title + teaser + CTA (async resolveData)
│   ├── HeroPlain.tsx
│   └── Page.tsx                         # used as the page-level Experience Template
└── lib/
    ├── design-tokens.ts                 # token id to CSS value table (used by resolveToken)
    ├── detect-viewport.ts               # User-Agent to viewport id
    └── experience-config.tsx            # the integration layer: component registry + async resolveData + tokens
```

## How server-side design resolution works

Contentful stores design **per viewport**, and often as **token references** (`{ type: 'DesignToken', value: 'color.primary' }`) rather than literal CSS. Before a component can style itself, that raw shape has to become a flat map of concrete values. The SDK handles this on the server, inside `fetchExperience` / `resolveExperience`, so your components never see the raw form.

For each node, resolution does two things:

1. **Cascade to a viewport.** Per-viewport design values collapse to a single flat map for the target viewport (see [Which viewport?](#which-viewport) below).
2. **Resolve tokens.** Every `DesignToken` goes through your `resolveToken` (from `config`) and is replaced with whatever it returns. Tokens the resolver doesn't recognize are dropped, and the server logs a warning naming the component.

The resolved map is then auto-filled onto the component's props by key: a design property named `backgroundColor` becomes a prop named `backgroundColor`. The component just reads its props:

```tsx
// components/Button.tsx — design values arrive as ordinary props
'use client';

export interface ButtonProps {
  label?: string;
  url?: string | null;
  // Design props (auto-filled, already resolved):
  target?: string;
  backgroundColor?: string;
  color?: string;
}

export function Button({ label, url, target = '_self', backgroundColor, color }: ButtonProps) {
  console.log('[Button] resolved props →', { label, url, target, backgroundColor, color });
  const style = { background: backgroundColor ?? '#4f39f6', color: color ?? '#fff' /* … */ };
  return url ? (
    <a href={url} target={target} style={style}>
      {label}
    </a>
  ) : (
    <button style={style}>{label}</button>
  );
}
```

Load `/landing` and watch the console: each component logs its resolved props, e.g.

```
[Section] resolved props → { gap: '64px', direction: 'row', verticalSpacing: '64px', … }
[HeroPlain] resolved props → { backgroundColor: '#0f172a', color: '#f8fafc', title: '…', … }
```

Those `64px` / `#0f172a` values are the _result_ of the cascade + token resolution — the payload stored `size.*` / `color.*` token ids, not literals. The client components log to the **browser console**; the `Page` template is a server component, so its log lands in the **server terminal**.

### Which viewport?

`resolveExperience` picks the "fallback" viewport to resolve against in this order:

1. `options.initialViewportId` — the per-request override this app sets from the User-Agent (`lib/detect-viewport.ts`).
2. `config.fallbackViewportId` — a static default, if you set one.
3. `viewports[0]` — the first viewport in the payload, when neither of the above is set or the id is unknown.

Seeding `initialViewportId` from the request means SSR resolves against the device's expected viewport, so the first paint matches and nothing re-styles after hydration. Pass the same id to `<ServerExperienceRenderer initialViewportId={…}>` (this app does) so the renderer agrees with what the server resolved.

## Integration pattern

The app separates **two layers**:

1. **Design-system components** (`components/Section.tsx`, `components/Heading.tsx`, …) are plain React components. They get their **content** props (`text`, `label`, `src`) and their **resolved design** props (`backgroundColor`, `gap`, `align`, …) together, and style themselves from those props. Since they import nothing SDK-shaped and are just functions of their props, they're easy to unit-test and render in isolation.
2. **The experience config** (`lib/experience-config.tsx`) is the integration layer. It maps each `componentId` to a component (bare, or `defineComponent({...})` for `defaults` / `resolveData`), maps `experienceTemplateId`s under `experienceTemplates`, and wires `resolveToken`, all composed into the single `experienceConfig` object the renderer takes.

The point of the split: everything SDK-shaped (registration, defaults, async resolvers, token resolution) lives in one file you can scan to see the whole integration, while the components stay SDK-agnostic.

```tsx
// components/Heading.tsx: content + resolved design, both as props
'use client';

export interface HeadingProps {
  text?: string;
  as?: 'h1' | 'h2' | 'h3'; // semantic design key, read by name
  align?: 'left' | 'center' | 'right';
  fontSize?: string;
  fontWeight?: string;
}

export function Heading({ text, as = 'h2', align, fontSize, fontWeight }: HeadingProps) {
  const Tag = as;
  return <Tag style={{ textAlign: align, fontSize, fontWeight }}>{text}</Tag>;
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
2. **resolved `design`** (cascaded to the viewport, tokens resolved)
3. `contentProperties` (editorial values from the payload)
4. `resolveData()` (return value of componentConfig.resolveData, see below)
5. slot props (each named slot becomes a pre-rendered React subtree)

Design sits **below** content and `resolveData`, so an explicit editorial value or a resolver result always wins over design on a key collision. So a payload like:

```json
{
  "component": { "sys": { "urn": ".../components/Button" } },
  "contentProperties": { "label": "Click me", "url": "example.com/go" },
  "designProperties": { "target": { "type": "ManualDesignValue", "value": "_self" } }
}
```

reaches your `Button` as `{ label: 'Click me', url: 'https://example.com/go', target: '_self' }` (after its `resolveData` runs), with content and design merged into one flat props object.

### Reading design on the client (optional)

Auto-filled props cover the common case. Reach for the `useDesignValues()` hook when props aren't enough:

- A **deeply nested presentational child** that isn't itself a registered component but needs the enclosing node's design.
- Code that reads design **outside the props flow**, such as a `useEffect`, an imperative measurement, or a helper that isn't in the render path.

```tsx
'use client';
import { useDesignValues } from '@contentful/experiences-react';

function Badge() {
  const design = useDesignValues<{ backgroundColor?: string }>(); // same resolved map that fills props
  return <span style={{ background: design.backgroundColor }}>New</span>;
}
```

The hook returns the same resolved values that auto-fill props (cascaded and token-resolved), and returns `{}` when called outside a renderer, so components still degrade gracefully in isolation. It's not required: this app's components use props only, and none of them call it.

> Need the raw, pre-resolution design (per-viewport, token references intact)? That's on `ContentfulComponent.design` / `useContentfulComponent()`, the escape hatch for building your own cascade. Almost no app needs it.

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

Resolvers run in parallel across nodes. Viewport resolution stays independent of
`resolveData`, so client-side viewport changes re-cascade design without ever
re-triggering `resolveData`.

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
    initialViewportId,
  }
);
```

Pair with `<ServerExperienceRenderer initialViewportId={...}>` (User-Agent
parsed on the server) so SSR resolves and renders against the device's expected
viewport. Otherwise resolution defaults to `viewports[0]`.

### `defineExperienceTemplate`: page-level wrappers

When a payload carries `sys.experienceTemplate`, the SDK looks up a matching id
under `Config.experienceTemplates` and wraps the rendered nodes with the
Experience Template's component. Experience Templates use the same `defaults` /
`resolveData` shape as components and receive resolved design as props the same
way; the only structural difference is that the component always receives a
fixed `children: ReactNode` (the rendered experience) alongside its declared
props.

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
