import type { Component } from 'svelte';

import type {
  DesignPropValue,
  ExperienceContext,
  ResolveContext,
  ResolveToken,
  ViewportDef,
} from '@contentful/experiences-core';

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
 * is a Svelte 5 Component receiving the merged prop bag (defaults + content +
 * resolveData + the `children` Snippet). The Experience runtime context and
 * the raw Contentful payload are reachable via `getExperience()` and
 * `getContentfulComponent()`.
 *
 * Design values are NOT injected as props. A component styles itself by
 * calling `getDesignValues()` and (optionally) `toCss()` at the top of its
 * `<script>` block — that helper is the single, explicit entry point for
 * design, so the SDK never spreads unknown `cf`-prefixed props onto customer
 * components.
 *
 * The `children` slot is passed as a named Snippet prop. The customer writes
 * `let { children, ... }: { children?: Snippet; ... } = $props()` and renders
 * it with `{@render children?.()}`.
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
   * Optional customer-supplied resolver that turns `DesignToken` envelopes
   * into runtime values before they reach a component. Called for each
   * design prop that arrived as (or cascaded to) a `DesignToken`.
   *
   * Runs sync at render time inside `<NodesRenderer />` (also inside
   * `<WrapWithTemplate />` for page-level template design props). If omitted,
   * envelopes pass through unchanged — customer components can still
   * inspect them via `getContentfulComponent().design`.
   *
   * See `ResolveToken` in `@contentful/experiences-core` for the full
   * contract, including the undefined-return warning behavior.
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
