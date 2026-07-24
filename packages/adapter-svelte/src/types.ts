import type { Component } from 'svelte';

import type {
  DesignPropValue,
  ExperienceContext,
  ResolveContext,
  ResolveToken,
  ViewportDef,
} from '@contentful/experiences-sdk-core';

export type { ResolveContext, ResolveToken };

/**
 * The full Contentful-side payload for a single component instance, exposed
 * via `getContentfulComponent()` to any descendant of a rendered Experience
 * node. Useful for custom design-property resolution outside the SDK's
 * cascade, branching by `componentTypeId` in a generic wrapper, keying
 * analytics on `nodeId`, rendering a raw-payload panel in preview, or
 * rendering non-`children` slots through the exported `<NodesRenderer />`.
 *
 * Design properties stay in their **raw envelope form** here (the same shape
 * `ctx.design` carries inside `resolveData`). The viewport-cascaded, token-
 * resolved values are what `getDesignValues()` returns.
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
 * the active viewport — a render-time value that resolvers cannot see.
 * Exposed via `getExperience()`.
 */
export interface RenderContext extends ExperienceContext {
  activeViewport: ViewportDef;
  activeViewportIndex: number;
}

/**
 * Customer-supplied configuration for a single component type. The `component`
 * receives the merged prop bag (content + resolveData + `children` Snippet).
 * Design values are not injected — a component reads them via
 * `getDesignValues()`. Runtime context and raw payload come from
 * `getExperience()` / `getContentfulComponent()`.
 */
export interface ComponentConfig<Props extends object = Record<string, unknown>> {
  defaults?: Partial<Props>;
  resolveData?: (ctx: ResolveContext) => Partial<Props> | Promise<Partial<Props>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Svelte's Component type uses internal generics that don't narrow ergonomically here.
  component: Component<any>;
}

/**
 * Registry value. Register a bare Svelte component for the common case, or
 * the full `ComponentConfig` shape when you need defaults or a `resolveData`
 * hook.
 *
 *   button: Button,                                 // bare
 *   header: { component: Header, defaults: {...} }, // with defaults
 *   card:   defineComponent<CardProps>({ component: Card, resolveData: ... }),
 */
export type Registration<Props extends object = Record<string, unknown>> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Component<any> | ComponentConfig<Props>;

export interface TemplateConfig<Props extends object = Record<string, unknown>> {
  defaults?: Partial<Props>;
  resolveData?: (ctx: ResolveContext) => Partial<Props> | Promise<Partial<Props>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: Component<any>;
}

export type TemplateRegistration<Props extends object = Record<string, unknown>> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Component<any> | TemplateConfig<Props>;

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
  /**
   * Resolves `DesignToken` envelopes to runtime values before they reach a
   * component. If omitted, envelopes pass through unchanged. See `ResolveToken`
   * in `@contentful/experiences-sdk-core` for the full contract.
   */
  resolveToken?: ResolveToken;
}

/**
 * Normalize a registry entry — bare Svelte component OR config object —
 * into the common `ComponentConfig` shape used by the renderer. Svelte 5
 * Components are callable functions; config objects are plain objects with
 * a `component` field, so `typeof` is enough to discriminate.
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
