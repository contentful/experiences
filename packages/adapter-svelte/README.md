# @contentful/experiences-svelte

> ⚠️ **Alpha.** Published to npm. APIs are unstable and will change.

The Svelte adapter for the Contentful Experiences SDK. You bring your own Svelte 5 components; it renders Experience payloads from the Experience Delivery API (XDA) with them.

```sh
npm install @contentful/experiences-svelte
```

This is the only rendering SDK package you install. It re-exports everything you need from `@contentful/experiences-sdk-core`, `@contentful/experiences-design`, and `@contentful/experiences-client`. The optional `@contentful/experiences-live-preview` package is also customer-facing and provides the framework-neutral live-preview client.

The public API mirrors `@contentful/experiences-react` 1:1 in shape; only the rendering primitives change (Svelte 5 `Component`s, Snippets instead of `children: ReactNode`, and `getDesignValues()` instead of `useDesignValues()`).

---

## Public API

### Authoring

```ts
defineComponent<Props>(config); // Type-narrowing identity for component-type configs
defineExperienceTemplate<Props>(config); // Same shape, for coded Experience Template configs
```

### Resolver

```ts
resolveExperience(payload, config, opts?); // Async; walks payload, runs resolveData, returns a PortableRenderPlan
```

### Live preview

```svelte
<script lang="ts">
  const livePreview = useLivePreview(() => ({
    spaceId,
    environmentId,
    previewToken,
    sessionId,
    initialData,
  }));

  const resolved = useResolvedExperience(() => ({
    data: livePreview.data,
    initialExperience,
    resolveOptions: { config: experienceConfig },
  }));
</script>

<ClientExperienceRenderer experience={resolved.data} config={experienceConfig} />
```

`useLivePreview` returns the latest raw Experience payload. `initialData` seeds
the first value. `useResolvedExperience` turns that payload into the
`PortableRenderPlan` consumed by the renderer and keeps the current rendered
experience while an update is being resolved.

The hooks expose `UseLivePreviewOptions`, `UseLivePreviewResult`,
`LivePreviewResolveOptions`, `UseResolvedExperienceOptions`, and
`UseResolvedExperienceResult`.

### Renderers

```ts
ServerExperienceRenderer; // SSR-safe; active viewport seeded from initialViewportId
ClientExperienceRenderer; // Subscribes to window.matchMedia via runes
MissingComponent; // Default fallback for unregistered component types
NodesRenderer; // Exposed so you can re-render a slot's raw nodes yourself (see Slot children)
useActiveViewport; // Rune-backed reactive object; you'll rarely need it directly
```

### Styling + runtime context (helpers)

```ts
getDesignValues<T>(); // Escape hatch: the same resolved design record that auto-fills props; read in a $derived to stay reactive
toCss(design, options?); // Turns a design record into a plain style object, keeping only real CSS keys
getExperience(); // RenderContext: debug, metadata, viewports, activeViewport
getContentfulComponent(); // Raw payload for the enclosing node (or undefined)
getContentfulExperienceTemplate(); // Same, for an enclosing coded Experience Template node
type ToCssOptions;
```

Resolved design values (viewport-cascaded + token-resolved server-side) are **auto-filled onto your component's props** by key, alongside content. Styling from `$props()` is the one recommended path. `getDesignValues()` exposes the same record (read it in a `$derived` to stay reactive) as an escape hatch. Reach for it only for a nested child that isn't itself a registered component, or for design needed outside the render path (an effect, an imperative measurement) — see [Styling components](../../README.md#styling-components). Token resolution is configured with `resolveToken` on your `Config` (`type ResolveToken`).

### Re-exported types and utilities

```ts
// From core
type Config, Components, ExperienceTemplates, Registration, ExperienceTemplateRegistration,
type ComponentConfig, ExperienceTemplateConfig,
type ContentfulComponent, ContentfulExperienceTemplate,
type RenderContext, ResolveToken,
type ExperiencePayload, ExperienceNode, ComponentNode, ExperienceTemplateNode,
type PortableRenderPlan, PortableRenderNode, PortableRegistration,
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

### Slot children

Every slot arrives as a prop named after the slot, holding an **array of Snippets** (`Snippet[]`), one per child — not a single wrapping Snippet. For the common "just render them" case, iterate the array with `{#each}` and `{@render}`; to wrap, reorder, or drop children individually, do it inside that loop.

```svelte
<!-- Section.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { children }: { children?: Snippet[] } = $props();
</script>

<!-- Common case — render them all: -->
<div>
  {#each children ?? [] as child}
    {@render child()}
  {/each}
</div>

<!-- Or take control of each child: -->
<!--
<div>
  {#each children ?? [] as child, i}
    <div class="cell">{@render child()}</div>
  {/each}
</div>
-->
```

`children` is not special — it is simply the conventional name for the default slot. **Every** slot in the payload becomes a same-named `Snippet[]` prop, so a component with a `header` slot just declares `header?: Snippet[]` and renders it the same way. This applies identically to coded Experience Templates: a template with a `content` slot receives a `content` prop.

If you'd rather render a slot's raw nodes yourself, they are still on the payload at `getContentfulComponent().slots` (a `Record<string, PortableRenderNode[]>`) — hand them to `NodesRenderer`.

For the full getting-started walkthrough, the merge-precedence rules, viewport handling, and design rationale, see the [root README](../../README.md) and [`AGENTS.md`](../../AGENTS.md).

---

## License

MIT. See the repository [`LICENSE`](../../LICENSE) and [`NOTICE`](../../NOTICE) for full attribution.
