import type { Component } from 'svelte';

import type {
  DesignPropValue,
  ExperienceContext,
  ResolveContext,
  ViewportDef,
} from '@contentful/experiences-core';

export type { ResolveContext };

/**
 * The full Contentful-side payload for a single component instance, exposed
 * via `getContentfulComponent()` to any descendant of a rendered Experience
 * node. Useful for:
 *
 *  - Custom design-property resolution outside the SDK's default cascade
 *  - Branching by `componentTypeId` in a generic wrapper component
 *  - Attaching analytics to specific node ids
 *  - Debugging — rendering a `<details>` block with the raw payload in preview
 *  - Rendering non-`children` slots through `<NodesRenderer />` directly
 *
 * Design properties stay in their **raw envelope form** here (the same shape
 * `ctx.design` carries inside `resolveData`). The flat scalars merged into
 * top-level props are what `resolveDesignProperties` produced after viewport
 * cascade.
 */
export interface ContentfulComponent {
  componentTypeId: string;
  nodeId?: string;
  content: Record<string, unknown>;
  design: Record<string, DesignPropValue>;
  resolved?: Record<string, unknown>;
  /**
   * Raw per-slot node arrays from the payload. The default slot named
   * `children` is rendered automatically and passed as a Snippet prop;
   * additional slots (if any) are reachable here and can be rendered with
   * `<NodesRenderer nodes={...} />`.
   */
  slots: Record<string, unknown>;
}

/**
 * Same shape as `ContentfulComponent`, but for the page-level template.
 * Exposed via `getContentfulTemplate()` inside a template's component tree.
 */
export interface ContentfulTemplate {
  templateId: string;
  content: Record<string, unknown>;
  design: Record<string, DesignPropValue>;
  resolved?: Record<string, unknown>;
}

/**
 * Render-time experience context. Extends the core `ExperienceContext` with
 * the active viewport — info that only exists at render time, not at
 * `resolveData` time. Exposed via `getExperience()`.
 */
export interface RenderContext extends ExperienceContext {
  activeViewport: ViewportDef;
  activeViewportIndex: number;
}

/**
 * Customer-supplied configuration for a single component type. The `component`
 * is a Svelte 5 Component — it receives only the merged prop bag (defaults +
 * content + design + resolveData + slot Snippets). The Experience runtime
 * context and the raw Contentful payload are NOT injected as props; reach for
 * them via `getExperience()` / `getContentfulComponent()`.
 *
 * Slots are spread as named Snippet props. Customer writes
 * `let { children, header }: { children?: Snippet; header?: Snippet } = $props()`
 * and renders with `{@render children?.()}`.
 */
export interface ComponentConfig<Props extends object = Record<string, unknown>> {
  defaults?: Partial<Props>;
  resolveData?: (ctx: ResolveContext) => Partial<Props> | Promise<Partial<Props>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Svelte's Component type uses internal generics that don't narrow ergonomically here.
  component: Component<any>;
}

/**
 * Registry value. Customers can register a bare Svelte component for the
 * common case, or the full `ComponentConfig` shape when they need defaults
 * or a `resolveData` hook.
 *
 *   button: Button,                                 // bare
 *   header: { component: Header, defaults: {...} }, // with defaults
 *   card:   defineComponent<CardProps>({ component: Card, resolveData: ... }),
 */
export type Registration<Props extends object = Record<string, unknown>> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | Component<any>
  | ComponentConfig<Props>;

export interface TemplateConfig<Props extends object = Record<string, unknown>> {
  defaults?: Partial<Props>;
  resolveData?: (ctx: ResolveContext) => Partial<Props> | Promise<Partial<Props>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: Component<any>;
}

export type TemplateRegistration<Props extends object = Record<string, unknown>> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | Component<any>
  | TemplateConfig<Props>;

export function defineTemplate<Props extends object = Record<string, unknown>>(
  config: TemplateConfig<Props>
): TemplateConfig<Props> {
  return config;
}

export function defineComponent<Props extends object = Record<string, unknown>>(
  config: ComponentConfig<Props>
): ComponentConfig<Props> {
  return config;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Components = Record<string, Registration<any>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Templates = Record<string, TemplateRegistration<any>>;

export interface Config {
  components: Components;
  templates?: Templates;
}

/**
 * Normalize a registry entry — bare Svelte component OR config object —
 * into the common `ComponentConfig` shape used by the renderer. Svelte 5
 * Components are functions (callable); config objects have a `component`
 * field. We discriminate by `typeof`.
 */
export function normalizeComponentRegistration<P extends object>(
  reg: Registration<P>
): ComponentConfig<P> {
  if (typeof reg === 'function') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { component: reg as Component<any> } as ComponentConfig<P>;
  }
  return reg;
}

export function normalizeTemplateRegistration<P extends object>(
  reg: TemplateRegistration<P>
): TemplateConfig<P> {
  if (typeof reg === 'function') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { component: reg as Component<any> } as TemplateConfig<P>;
  }
  return reg;
}
