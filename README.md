# Contentful Experiences SDK

> ⚠️ **Pre-alpha.** Not yet published to npm. APIs are unstable and will change.

A renderer SDK for Contentful's **Experience Orchestration (ExO)**. You bring a design system; the SDK takes the Experience payload from the Experience Delivery API (XDA) and renders it.

```sh
npm install @contentful/experiences-react @contentful/experience-delivery
```

That's the only SDK package customers install — it re-exports everything you need (resolver, types, renderer, design utilities). The `@contentful/experiences-core` and `@contentful/experiences-design` packages are workspace-internal implementation details.

---

## Quick start

The smallest working example. Three steps: register your components, fetch + resolve an Experience, render it.

### 1. Register your components and (optional) templates

```tsx
// experience-config.ts
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
    resolveData: ({ content }) => ({ url: ensureScheme(content.url) }),
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

### 2. Fetch + resolve an Experience (server-side)

```tsx
// app/[slug]/page.tsx (Next.js App Router)
import { ContentfulViewDeliveryClient } from '@contentful/experience-delivery';
import { resolveExperience, ServerExperienceRenderer } from '@contentful/experiences-react';
import { experienceConfig } from '@/lib/experience-config';

const client = new ContentfulViewDeliveryClient({ token: process.env.CDA_TOKEN! });

export default async function ExperiencePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const payload = await client.view.getExperience(
    process.env.SPACE_ID!,
    'master',
    slug,
  );

  const experience = await resolveExperience(payload, experienceConfig);

  return <ServerExperienceRenderer experience={experience} config={experienceConfig} />;
}
```

That's it. The renderer walks the payload, resolves design properties to plain scalars at the active viewport, runs any `resolveData` hooks (in parallel), and dispatches each node to your registered React component.

---

## How it works

### `defineComponent` + `defineTemplate`

Each entry in your registry pairs a Contentful component-type id with a render fn. The customer's render fn receives a flat prop bag plus an `experience` context.

```tsx
defineComponent<ButtonProps>({
  // ─── all optional ────────────────────────────────────────────
  defaults: { type: 'primary' },          // lowest precedence
  resolveData: async ({ content }) => ({  // sync or async transform
    url: await localizeUrl(content.url),
  }),
  // ─── required ────────────────────────────────────────────────
  render: Button,                         // your design-system component
})
```

Templates are page-level wrappers. Same shape — their render fn always receives a fixed `children: ReactNode` (the rendered experience nodes).

### Merge precedence (last wins)

The render fn receives a merged prop bag:

1. `defaults`             — fallback values
2. `contentProperties`    — editorial values from the payload
3. `designProperties`     — viewport-cascaded, envelope-unwrapped to scalars
4. `resolveData()` output — your transform's return value
5. slot props             — each named slot becomes a pre-rendered React subtree
6. `experience`           — `{ isPreview, metadata, viewports, activeViewport, activeViewportIndex }`

So if `content.text === 'Hello'` and `defaults.text === 'Default'`, your component receives `text: 'Hello'`.

### Active viewport

Customer components receive `experience.activeViewport` — the runtime answer to "which viewport am I rendering at?". Useful for conditional logic the SDK can't pre-resolve (different children per viewport, disabling animations on small screens, analytics).

Design properties don't need this — they're already pre-resolved to scalars before reaching `render`.

### Server vs Client renderer

| Use this when... | Symbol | Behavior |
|---|---|---|
| In a server component (RSC) | `ServerExperienceRenderer` | Active viewport seeded once from `initialViewportId` (e.g. derived from User-Agent on the request) |
| In a `'use client'` component | `ClientExperienceRenderer` (also exported as `ExperienceRenderer`) | Subscribes to `window.matchMedia`, re-renders on viewport changes |

Pass `initialViewportId` to both so the SSR output matches the first client paint (avoids hydration drift).

```tsx
import { headers } from 'next/headers';

const userAgent = (await headers()).get('user-agent') ?? '';
const initialViewportId = detectViewportFromUserAgent(userAgent); // your call

return (
  <ServerExperienceRenderer
    experience={experience}
    config={experienceConfig}
    initialViewportId={initialViewportId}
  />
);
```

---

## Example app

A working Next.js 15 example lives in [`examples/nextjs/`](./examples/nextjs/). It demonstrates:

- Server-side fetch via `@contentful/experience-delivery`
- `defineComponent` + `defineTemplate` integration layer in `lib/experience-config.ts`
- Plain design-system components in `components/` (no SDK awareness)
- User-Agent → viewport-id seeding for hydration-safe SSR

```sh
cd examples/nextjs
cp .env.example .env.local      # fill in SPACE_ID + CDA_TOKEN
npm run dev
```

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

The SDK glue (defaults, resolvers, prop reshaping, slot binding) all lives in one file: `lib/experience-config.ts`. Easy to scan, easy to change.

---

## Workspace internals

This is an Nx monorepo. Customers install only the framework adapter; the rest is workspace-internal.

| Folder | npm name | Audience |
|---|---|---|
| [`packages/core`](./packages/core) | `@contentful/experiences-core` | **Internal.** Runtime-neutral types + `resolveExperience`. |
| [`packages/design`](./packages/design) | `@contentful/experiences-design` | **Internal.** Viewport math (`getValueForViewport`, `resolveDesignProperties`, `toCssMediaQuery`). |
| [`packages/adapter-react`](./packages/adapter-react) | `@contentful/experiences-react` | **Customer-facing.** React renderer + re-exports of everything else. |

Future framework adapters slot in under the same pattern (`packages/adapter-svelte`, `packages/adapter-vue`, `packages/adapter-angular`, …) and consume the same internal core + design packages.

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

## License

MIT. See [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE).
