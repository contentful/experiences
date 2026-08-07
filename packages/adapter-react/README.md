# @contentful/experiences-react

> ⚠️ **Alpha.** Published to npm. APIs are unstable and will change.

The React adapter for the Contentful Experiences SDK. You bring your own React components; it renders Experience payloads from the Experience Delivery API (XDA) with them.

```sh
npm install @contentful/experiences-react
```

This is the **only SDK package you install**. It re-exports everything you need from `@contentful/experiences-sdk-core`, `@contentful/experiences-design`, and `@contentful/experiences-client`. The other packages are workspace-internal.

---

## Public API

### Authoring

```ts
defineComponent<Props>(config); // Type-narrowing identity for component-type configs
defineExperienceTemplate<Props>(config); // Same shape, for page-level Experience Template wrappers
```

### Fetching

```ts
fetchExperience(experienceOptions, clientOptions, resolveOptions)  // Async; fetches from XDA and resolves in one call
createClient(options)                       // Functional constructor matching the SDK's option shape
ContentfulViewDeliveryClient                // Re-exported delivery client for advanced use cases
NotFoundError                               // Thrown when the Experience ID doesn't exist
ContentfulViewDelivery                      // Full error namespace from the delivery client
type ExperienceOptions, ClientOptions, ResolveOptions, CreateClientOptions
```

### Resolver

```ts
resolveExperience(payload, config, opts?)   // Async; walks payload, runs resolveData, returns a PortableRenderPlan
```

### Renderers

```ts
ServerExperienceRenderer; // RSC-friendly, active viewport seeded from initialViewportId
ClientExperienceRenderer; // 'use client', subscribes to window.matchMedia, alias: ExperienceRenderer
MissingComponent; // Default fallback for unregistered component types
useActiveViewport; // Hook used inside ClientExperienceRenderer (you'll rarely need it directly)
```

### Styling + runtime context (hooks)

```ts
useDesignValues<T>(); // Optional hook: the same resolved design record that auto-fills props
toCss(design, options?); // Turns a design record into CSSProperties, keeping only real CSS keys
useExperience(); // RenderContext: debug, metadata, viewports, activeViewport
useContentfulComponent(); // Raw payload for the enclosing node (or null)
useContentfulExperienceTemplate(); // Same, for the page-level Experience Template
type ToCssOptions;
```

Resolved design values (viewport-cascaded + token-resolved server-side) are **auto-filled onto your component's props** by key, alongside content. Styling straight from props is the recommended path; `useDesignValues()` exposes the same record for cases props don't cover. Token resolution is configured with `resolveToken` on your `Config` (`type ResolveToken`).

### Re-exported types and utilities

```ts
// From core
type Config, Components, ExperienceTemplates, Registration, ExperienceTemplateRegistration,
type ComponentConfig, ExperienceTemplateConfig,
type ContentfulComponent, ContentfulExperienceTemplate,
type RenderContext, ResolveToken,
type ExperiencePayload, ExperienceNode, ComponentNode, ExperienceTemplateNode,
type PortableRenderPlan, PortableRenderNode, PortableExperienceTemplate,
type DesignPropValue, ManualDesignValue, DesignToken, ValuesByViewport,
type ViewportDef, ExperienceContext, ResolveContext,
type ResolverConfig, ResolveExperienceOptions

// From design (if you want to do your own viewport-aware resolution)
getValueForViewport, getViewportIndex, resolveDesignProperties, toCssMediaQuery,
isCssProperty, toCssKey, CSS_PROPERTIES
```

---

## Quick reference

```tsx
// components/Button.tsx: content + resolved design both arrive as props
'use client';

interface ButtonProps {
  label?: string;
  url?: string;
  backgroundColor?: string; // resolved design, auto-filled
  color?: string;
}

export function Button({ label, url, backgroundColor, color }: ButtonProps) {
  return (
    <a href={url} style={{ background: backgroundColor, color }}>
      {label}
    </a>
  );
}
```

```tsx
// lib/experience-config.tsx
import {
  defineComponent,
  type Components,
  type Config,
  type ResolveToken,
} from '@contentful/experiences-react';

import { Button } from './components/Button';

const components: Components = {
  // Bare component, or defineComponent({...}) when you need defaults/resolveData.
  Button: defineComponent({
    resolveData: ({ content }) => ({ url: ensureScheme(content.url) }),
    component: Button,
  }),
};

const resolveToken: ResolveToken = (token) => designTokens[token.value];

export const experienceConfig: Config = { components, resolveToken };
```

```tsx
// app/[slug]/page.tsx: in a server component
import { fetchExperience, ServerExperienceRenderer } from '@contentful/experiences-react';

const experience = await fetchExperience(
  { spaceId: process.env.SPACE_ID!, environmentId: 'master', experienceId: slug },
  { accessToken: process.env.CDA_TOKEN! },
  { config: experienceConfig }
);
return <ServerExperienceRenderer experience={experience} config={experienceConfig} />;
```

For the full getting-started walkthrough, the merge-precedence rules, viewport handling, and design rationale, see the [root README](../../README.md) and [`AGENTS.md`](../../AGENTS.md).

---

## License

MIT. See the repository [`LICENSE`](../../LICENSE) and [`NOTICE`](../../NOTICE) for full attribution.
