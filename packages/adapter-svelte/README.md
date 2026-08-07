# @contentful/experiences-svelte

> ⚠️ **Alpha.** Published to npm. APIs are unstable and will change.

The Svelte adapter for the Contentful Experiences SDK. You bring your own Svelte 5 components; it renders Experience payloads from the Experience Delivery API (XDA) with them.

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
defineExperienceTemplate<Props>(config); // Same shape, for page-level Experience Template wrappers
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
getDesignValues<T>(); // Optional helper: the same resolved design record that auto-fills props; read in a $derived to stay reactive
toCss(design, options?); // Turns a design record into a plain style object, keeping only real CSS keys
getExperience(); // RenderContext: debug, metadata, viewports, activeViewport
getContentfulComponent(); // Raw payload for the enclosing node (or undefined)
getContentfulExperienceTemplate(); // Same, for the page-level Experience Template
type ToCssOptions;
```

Resolved design values (viewport-cascaded + token-resolved server-side) are **auto-filled onto your component's props** by key, alongside content. Styling straight from `$props()` is the recommended path; `getDesignValues()` exposes the same record (read it in a `$derived` to stay reactive) for cases props don't cover. Token resolution is configured with `resolveToken` on your `Config` (`type ResolveToken`).

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

```svelte
<!-- Button.svelte: content + resolved design both arrive as props -->
<script lang="ts">
  interface ButtonProps {
    label?: string;
    url?: string;
    backgroundColor?: string; // resolved design, auto-filled
    color?: string;
  }

  let { label = 'Button', url, backgroundColor, color }: ButtonProps = $props();
</script>
{#if url}
  <a href={url} style="background: {backgroundColor}; color: {color};">{label}</a>
{:else}
  <button type="button" style="background: {backgroundColor}; color: {color};">{label}</button>
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
