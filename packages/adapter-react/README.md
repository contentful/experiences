# @contentful/experiences-react

> ⚠️ **Pre-alpha.** Not yet published to npm. APIs are unstable and will change.

The React adapter for the Contentful Experiences SDK suite. Renders Experience payloads from the Experience Delivery API (XDA) using customer-supplied React components.

```sh
npm install @contentful/experiences-react
```

This is the **only SDK package customers install** — it re-exports everything from `@contentful/experiences-core`, `@contentful/experiences-design`, and `@contentful/experiences-client` that consumers need. The other packages are workspace-internal.

---

## Public API

### Authoring

```ts
defineComponent<Props>(config); // Type-narrowing identity for component-type configs
defineTemplate<Props>(config); // Same shape, for page-level template wrappers
```

### Resolver

```ts
resolveExperience(payload, config, opts?)   // Async — walks payload, runs resolveData, returns a PortableRenderPlan
```

### Renderers

```ts
ServerExperienceRenderer; // RSC-friendly, active viewport seeded from initialViewportId
ClientExperienceRenderer; // 'use client', subscribes to window.matchMedia, alias: ExperienceRenderer
MissingComponent; // Default fallback for unregistered component types
useActiveViewport; // Hook used inside ClientExperienceRenderer (rarely needed by consumers)
```

### Delivery client

```ts
createExperienceClient(options); // Factory — returns an ExperienceClient (XDN or XPA based on preview flag)
type ExperienceClient;           // Extends ContentfulViewDeliveryClient with spaceId, environmentId, preview
type ExperienceClientOptions;
```

### Re-exported types and utilities

```ts
// From core
type Config, Components, Templates,
type ComponentConfig, TemplateConfig,
type ComponentProps, TemplateProps,
type RenderContext,
type ExperiencePayload, ExperienceNode, ComponentTypeNode, TemplateNode,
type PortableRenderPlan, PortableRenderNode, PortableTemplate,
type DesignPropValue, ManualDesignValue, DesignToken, ValuesByViewport,
type ViewportDef, ExperienceContext, ResolveContext,
type ResolverConfig, ResolveExperienceOptions

// From design (for customers who want to do their own viewport-aware resolution)
getValueForViewport, getViewportIndex, resolveDesignProperties, toCssMediaQuery
```

---

## Quick reference

```tsx
import {
  createExperienceClient,
  defineComponent,
  defineTemplate,
  resolveExperience,
  ServerExperienceRenderer,
  type Config,
  type Components,
  type Templates,
} from '@contentful/experiences-react';

import { Button, type ButtonProps } from './components/Button';

const client = createExperienceClient({
  spaceId: process.env.SPACE_ID!,
  environmentId: 'master',
  accessToken: process.env.CDA_TOKEN!,
});

const components: Components = {
  button: defineComponent<ButtonProps>({
    defaults: { type: 'primary' },
    resolveData: ({ content }) => ({ url: ensureScheme(content.url) }),
    render: Button,
  }),
};

const experienceConfig: Config = { components };

// In a server component:
const payload = await client.view.getExperience(client.spaceId, client.environmentId, slug);
const experience = await resolveExperience(payload, experienceConfig);
return <ServerExperienceRenderer experience={experience} config={experienceConfig} />;
```

For the full getting-started walkthrough, the merge-precedence rules, viewport handling, and design rationale, see the [root README](../../README.md) and [`AGENTS.md`](../../AGENTS.md).

---

## License

MIT. See the repository [`LICENSE`](../../LICENSE) and [`NOTICE`](../../NOTICE) for full attribution.
