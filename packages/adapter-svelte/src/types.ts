import type { Component, Snippet } from 'svelte';

import type {
  DesignPropValue,
  ExperienceContext,
  ResolveContext,
  ViewportDef,
} from '@contentful/experiences-core';

export type { ResolveContext };

/**
 * The full Contentful-side payload for a single component instance, surfaced
 * on the `contentful` prop of every customer component. Useful for:
 *
 *  - Custom design-property resolution outside the SDK's default cascade
 *  - Branching by `componentTypeId` in a generic wrapper component
 *  - Attaching analytics to specific node ids
 *  - Debugging — rendering a `<details>` block with the raw payload in preview
 *
 * Design properties stay in their **raw envelope form** here (the same shape
 * `ctx.design` carries inside `resolveData`). The flat scalars merged into
 * top-level props are what `resolveDesignProperties` produced after viewport
 * cascade. The `contentful` prop is the unprocessed input; the spread props
 * are the processed output.
 */
export interface ContentfulComponent {
  /** The component-type id from the URN's last slash-segment (e.g. `button`). */
  componentTypeId: string;
  /** Optional. Pass-through of `node.id` from the payload when the editor supplied one. */
  nodeId?: string;
  /** Editorial values exactly as the payload delivered them. */
  content: Record<string, unknown>;
  /** Design-property envelopes (NOT viewport-resolved). Same shape `ctx.design` carries. */
  design: Record<string, DesignPropValue>;
  /** Return value of the component's `resolveData` hook, if any. Undefined when no hook is registered. */
  resolved?: Record<string, unknown>;
}

/**
 * Same shape as `ContentfulComponent`, but for the page-level template.
 * Surfaced on the `contentful` prop of the template's component.
 */
export interface ContentfulTemplate {
  /** The template id from the URN's last slash-segment (e.g. `page`). */
  templateId: string;
  content: Record<string, unknown>;
  design: Record<string, DesignPropValue>;
  resolved?: Record<string, unknown>;
}

/**
 * Render-time experience context. Extends the core `ExperienceContext` with
 * the active viewport — info that only exists at render time, not at
 * `resolveData` time (resolvers run once before viewport resolution; viewport
 * changes on the client should not re-trigger resolvers).
 *
 * This type is Svelte-adapter-specific. Other adapters (React, SwiftUI,
 * Compose, Angular, …) define their own equivalents using the platform's
 * idiomatic primitive for "current viewport"; the SDK's runtime-neutral core
 * deliberately does not carry an `activeViewport` because each framework
 * computes it differently (`matchMedia`, `@Environment`, `LocalConfiguration`,
 * etc.).
 *
 * Common uses:
 *  - Branching renders by viewport (`if (experience.activeViewport.id === 'mobile') ...`)
 *  - Reading viewport metadata (e.g. `displayName`, `previewSize`) for analytics
 *  - Disabling features on small screens
 *
 * Customers do NOT need this for design-prop resolution — those are already
 * pre-resolved to plain scalars by the renderer before reaching the component.
 */
export interface RenderContext extends ExperienceContext {
  /** The currently active viewport — last-matching media query / device trait. */
  activeViewport: ViewportDef;
  /** Index of `activeViewport` in `viewports`. */
  activeViewportIndex: number;
}

/**
 * Props that flow into every customer component. Composed from five sources,
 * spread last-wins by `NodesRenderer`:
 *
 *   1. defaults                    (componentConfig.defaults)
 *   2. content properties           (editorial values from XDA)
 *   3. resolved design properties   (viewport-cascade unwrapped to scalars)
 *   4. resolved data                (return value of componentConfig.resolveData)
 *   5. `experience`                 (RenderContext — runtime context + active viewport)
 *   6. `slot`                       (Snippet dispatcher — see below)
 *
 * Slots arrive as a single `slot: Snippet<[string]>` dispatcher. Render any
 * named slot with `{@render slot('children')}`, `{@render slot('header')}`,
 * etc. Unknown slot names render nothing.
 *
 * Why one dispatcher and not one named prop per slot like React? Svelte 5
 * Snippets are compile-time entities; `Record<string, Snippet>` synthesized
 * from runtime payload data can't be spread as named props. The single
 * dispatcher is the idiomatic Svelte workaround.
 */
export type ComponentProps<Props extends object> = Props & {
  experience: RenderContext;
  slot: Snippet<[string]>;
  contentful: ContentfulComponent;
};

/**
 * Customer-supplied configuration for a single component type. Author with
 * `defineComponent<Props>(...)` for full type inference inside `resolveData`.
 *
 * The `component` field is the default export of a `.svelte` file (a Svelte 5
 * Component constructor). The renderer instantiates it with composed props.
 */
export interface ComponentConfig<Props extends object = Record<string, unknown>> {
  /**
   * Lowest-precedence prop bag. Merged in before content / design / resolveData /
   * slots / experience. Useful for variant fallbacks and similar fixed defaults
   * the editorial layer doesn't always supply.
   */
  defaults?: Partial<Props>;
  /**
   * Optional sync-or-async hook that derives final props from the raw
   * Experience inputs. Returns a partial prop bag merged in **after** content
   * and design, **before** slots and `experience`. Useful for:
   *
   *  - Reshaping editorial fields (e.g. uppercase, format)
   *  - Pulling in external data tied to a content field (e.g. price by SKU)
   *  - Localizing URLs or strings using `experience.metadata`
   *  - Renaming or dropping fields the editor produces
   *
   * v1: `slots` are NOT exposed here — they're framework-side, pre-rendered
   * during the Svelte pass.
   */
  resolveData?: (ctx: ResolveContext) => Partial<Props> | Promise<Partial<Props>>;
  /**
   * Required. The default export of a `.svelte` file — a Svelte 5 Component.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Svelte's Component type uses internal generics that don't narrow ergonomically here.
  component: Component<any>;
}

/**
 * Props passed to a template's component — its declared `Props` plus a
 * fixed `children` Snippet (the rendered experience nodes) and the
 * `experience` runtime context (RenderContext, with active viewport).
 *
 * Render the children Snippet with `{@render children()}`.
 */
export type TemplateProps<Props extends object> = Props & {
  children: Snippet;
  experience: RenderContext;
  contentful: ContentfulTemplate;
};

/**
 * Customer-supplied configuration for a single page-level template. Author
 * with `defineTemplate<Props>(...)`. Templates carry the same defaults +
 * resolveData shape as components — the only structural difference is that
 * a template's component receives a `children: Snippet` (the rendered
 * experience nodes).
 */
export interface TemplateConfig<Props extends object = Record<string, unknown>> {
  defaults?: Partial<Props>;
  resolveData?: (ctx: ResolveContext) => Partial<Props> | Promise<Partial<Props>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see ComponentConfig.component note
  component: Component<any>;
}

/**
 * Identity helper — returns the template config as-is, but narrows the
 * `resolveData` parameter types to your declared `Props`.
 */
export function defineTemplate<Props extends object = Record<string, unknown>>(
  config: TemplateConfig<Props>
): TemplateConfig<Props> {
  return config;
}

/**
 * Component registry shape — keyed by `componentTypeId` (the segment after
 * the last slash in `componentType.sys.urn`). Use this type to annotate a
 * standalone `components` const before composing it into `Config`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- per-entry narrowing happens at defineComponent authoring time.
export type Components = Record<string, ComponentConfig<any>>;

/**
 * Template registry shape — keyed by `templateId` (the segment after the
 * last slash in `payload.sys.template.sys.urn`).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- per-entry narrowing happens at defineTemplate authoring time.
export type Templates = Record<string, TemplateConfig<any>>;

/**
 * The customer-supplied experience config. Compose `Components` +
 * `Templates` into a single `Config` and hand it to `resolveExperience` and
 * `<ServerExperienceRenderer>`.
 */
export interface Config {
  components: Components;
  templates?: Templates;
}

/**
 * Identity helper — returns the config object as-is, but narrows the
 * `resolveData` parameter types to your declared `Props`.
 */
export function defineComponent<Props extends object = Record<string, unknown>>(
  config: ComponentConfig<Props>
): ComponentConfig<Props> {
  return config;
}
