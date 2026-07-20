# @contentful/experiences-svelte

> ⚠️ **Pre-alpha.** Not yet published to npm. APIs are unstable and will change.

The Svelte adapter for the Contentful Experiences SDK suite. Renders Experience payloads from the Experience Delivery API (XDA) using your own Svelte 5 components.

```sh
npm install @contentful/experiences-svelte
```

This is the **only SDK package you install**. It re-exports everything you need from `@contentful/experiences-sdk-core` and `@contentful/experiences-design`. The other packages are workspace-internal.

The public API mirrors `@contentful/experiences-react` 1:1 in shape; only the rendering primitives change (Svelte 5 `Component`s, Snippets instead of `children: ReactNode`, and `getDesignValues()` instead of `useDesignValues()`).

---

## Public API

### Authoring

```ts
defineComponent<Props>(config); // Type-narrowing identity for component-type configs
defineTemplate<Props>(config); // Same shape, for page-level template wrappers
```

### Resolver

```ts
resolveExperience(payload, config, opts?); // Async; walks payload, runs resolveData, returns a PortableRenderPlan
```

### Renderers

```ts
ServerExperienceRenderer; // SSR-safe; active viewport seeded from initialViewportId
ClientExperienceRenderer; // Subscribes to window.matchMedia via runes
MissingComponent; // Default fallback for unregistered component types
NodesRenderer; // Exposed so you can render non-`children` slots manually
useActiveViewport; // Rune-backed reactive object; you'll rarely need it directly
```

### Styling + runtime context (helpers)

```ts
getDesignValues<T>(); // Resolved design values for the current node; read in a $derived to stay reactive
toCss(design, options?); // Turns a design record into a plain style object, keeping only real CSS keys
getExperience(); // RenderContext: isPreview, metadata, viewports, activeViewport
getContentfulComponent(); // Raw payload for the enclosing node (or undefined)
getContentfulTemplate(); // Same, for the page-level template
type ToCssOptions;
```

Design is **not** injected as props; components read it via `getDesignValues()` from the top of their `<script>` block. Token resolution is configured with `resolveToken` on your `Config` (`type ResolveToken`).

### Re-exported types and utilities

```ts
// From core
type Config, Components, Templates, Registration, TemplateRegistration,
type ComponentConfig, TemplateConfig,
type ContentfulComponent, ContentfulTemplate,
type RenderContext, ResolveToken,
type ExperiencePayload, ExperienceNode, ComponentTypeNode, TemplateNode,
type PortableRenderPlan, PortableRenderNode, PortableTemplate,
type DesignPropValue, ManualDesignValue, DesignToken, ValuesByViewport,
type ViewportDef, ExperienceContext, ResolveContext,
type ResolverConfig, ResolveExperienceOptions

// From design (if you want to do your own viewport-aware resolution)
getValueForViewport, getViewportIndex, resolveDesignProperties, toCssMediaQuery,
isCssProperty, toCssKey, CSS_PROPERTIES
```

---

## Quick reference

```svelte
<!-- Button.svelte: content via props, design via the helper -->
<script lang="ts">
  import { getDesignValues, toCss } from '@contentful/experiences-svelte';

  let { label = 'Button', url }: ButtonProps = $props();
  const design = $derived(getDesignValues());
  const style = $derived(toCss(design));
</script>
{#if url}
  <a href={url} style={style}>{label}</a>
{:else}
  <button type="button" style={style}>{label}</button>
{/if}
```

```ts
// experience-config.ts
import {
  defineComponent,
  type Components,
  type Config,
  type ResolveToken,
} from '@contentful/experiences-svelte';
import Button from './components/Button.svelte';
import type { ButtonProps } from './components/Button.svelte';

const components: Components = {
  // Bare component, or defineComponent({...}) when you need defaults/resolveData.
  Button: defineComponent<ButtonProps>({
    resolveData: ({ content }) => ({ url: ensureScheme(content.url) }),
    component: Button,
  }),
};

const resolveToken: ResolveToken = (token) => designTokens[token.value];

export const experienceConfig: Config = { components, resolveToken };
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
