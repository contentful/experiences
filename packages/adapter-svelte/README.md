# @contentful/experiences-svelte

> ⚠️ **Pre-alpha.** Not yet published to npm. APIs are unstable and will change.

The Svelte adapter for the Contentful Experiences SDK suite. Renders Experience payloads from the Experience Delivery API (XDA) using customer-supplied Svelte 5 components.

```sh
npm install @contentful/experiences-svelte @contentful/experience-delivery
```

This is the **only SDK package customers install** — it re-exports everything from `@contentful/experiences-core` and `@contentful/experiences-design` that consumers need. The other packages are workspace-internal.

The public API mirrors `@contentful/experiences-react` 1:1 in shape; only the rendering primitives change (`component: SvelteComponent` instead of `render: () => ReactNode`, Snippets instead of `children: ReactNode`).

---

## Public API

### Authoring

```ts
defineComponent<Props>(config); // Type-narrowing identity for component-type configs
defineTemplate<Props>(config); // Same shape, for page-level template wrappers
```

### Resolver

```ts
resolveExperience(payload, config, opts?); // Async — walks payload, runs resolveData, returns a PortableRenderPlan
```

### Renderers

```ts
ServerExperienceRenderer; // SSR-safe; active viewport seeded from initialViewportId
ClientExperienceRenderer; // Subscribes to window.matchMedia via runes
MissingComponent; // Default fallback for unregistered component types
useActiveViewport; // Rune-backed reactive object; rarely needed by consumers
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

```svelte
<!-- Button.svelte -->
<script lang="ts">
  let { text = 'Button', url, type = 'primary' }: ButtonProps = $props();
</script>
{#if url}
  <a href={url}>{text}</a>
{:else}
  <button type="button">{text}</button>
{/if}
```

```ts
// experience-config.ts
import { defineComponent, type Config, type Components } from '@contentful/experiences-svelte';
import Button from './components/Button.svelte';
import type { ButtonProps } from './components/Button.svelte';

const components: Components = {
  button: defineComponent<ButtonProps>({
    defaults: { type: 'primary' },
    resolveData: ({ content }) => ({ url: ensureScheme(content.url) }),
    component: Button,
  }),
};

export const experienceConfig: Config = { components };
```

```svelte
<!-- +page.svelte -->
<script lang="ts">
  import { ServerExperienceRenderer } from '@contentful/experiences-svelte';
  let { data } = $props();
</script>
<ServerExperienceRenderer experience={data.experience} config={experienceConfig} />
```

For the full getting-started walkthrough, the merge-precedence rules, viewport handling, and design rationale, see the [root README](../../README.md) and [`AGENTS.md`](../../AGENTS.md).

---

## License

MIT. See the repository [`LICENSE`](../../LICENSE) and [`NOTICE`](../../NOTICE) for full attribution.
