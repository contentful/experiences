import type { Component } from 'svelte';

import type {
  DesignPropValue,
  RenderContext,
  ResolveContext,
  ResolveToken,
} from '@contentful/experiences-sdk-core';

export type { ResolveContext, ResolveToken };

/**
 * The full Contentful-side payload for a single component instance, exposed
 * via `getContentfulComponent()` to any descendant of a rendered Experience
 * node. Useful for custom design-property resolution outside the SDK's
 * cascade, branching by `componentId` in a generic wrapper, keying
 * analytics on `nodeId`, rendering a raw-payload panel in preview, or
 * re-rendering a slot's nodes yourself through the exported `<NodesRenderer />`.
 *
 * Design properties stay in their **raw discriminated form** here (the same
 * shape `ctx.design` carries inside `resolveData`). The viewport-cascaded,
 * token-resolved values are what `getDesignValues()` returns.
 */
export interface ContentfulComponent {
  componentId: string;
  nodeId?: string;
  content: Record<string, unknown>;
  design: Record<string, DesignPropValue>;
  resolved?: Record<string, unknown>;
  /**
   * Raw per-slot node arrays from the payload. Every slot is also rendered
   * automatically and passed as a same-named `Snippet[]` prop (`children` is
   * not special); these raw nodes are here for callers that want to render a
   * slot themselves with `<NodesRenderer nodes={...} />`.
   */
  slots: Record<string, unknown>;
}

/**
 * Same shape as `ContentfulComponent`, but for an Experience Template node.
 * Exposed via `getContentfulExperienceTemplate()` inside an Experience
 * Template's component tree.
 */
export interface ContentfulExperienceTemplate {
  experienceTemplateId: string;
  nodeId?: string;
  content: Record<string, unknown>;
  design: Record<string, DesignPropValue>;
  resolved?: Record<string, unknown>;
}

/**
 * Render-time experience context — `debug`, `metadata`, `viewports`, the active
 * viewport, and the viewport the server pre-resolved design against.
 *
 * Re-exported from `@contentful/experiences-sdk-core` rather than declared here.
 * It is plain data with no React dependency, and every adapter exposes the same
 * shape through its own accessor idiom, so one declaration keeps the three
 * adapters from drifting. Read it with `getExperience()`.
 */
export type { RenderContext };

/**
 * Customer-supplied configuration for a single component type. The `component`
 * receives the merged props (design + content + resolveData + one `Snippet[]`
 * prop per slot); resolved design values auto-fill matching props and are also
 * readable via `getDesignValues()`. Runtime context and raw payload come from
 * `getExperience()` / `getContentfulComponent()`.
 */
export interface ComponentConfig<Props extends object = Record<string, unknown>> {
  /**
   * Lowest-precedence defaults object. Merged in before content / resolveData /
   * slots. Useful for variant fallbacks the editorial layer doesn't always supply.
   */
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

/**
 * Customer-supplied configuration for a coded Experience Template. Identical in
 * shape and behavior to `ComponentConfig` — an Experience Template is just a
 * node whose implementation lives in the `experienceTemplates` registry. Its
 * slots arrive as named `Snippet[]` props (a `content` slot becomes a `content`
 * prop), so there is no `children` special case.
 */
export interface ExperienceTemplateConfig<Props extends object = Record<string, unknown>> {
  /**
   * Lowest-precedence defaults object. Merged in before content / resolveData /
   * slots. Useful for variant fallbacks the editorial layer doesn't always supply.
   */
  defaults?: Partial<Props>;
  resolveData?: (ctx: ResolveContext) => Partial<Props> | Promise<Partial<Props>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: Component<any>;
}

export type ExperienceTemplateRegistration<Props extends object = Record<string, unknown>> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Component<any> | ExperienceTemplateConfig<Props>;

export function defineExperienceTemplate<Props extends object = Record<string, unknown>>(
  config: ExperienceTemplateConfig<Props>
): ExperienceTemplateConfig<Props> {
  return config;
}

export function defineComponent<Props extends object = Record<string, unknown>>(
  config: ComponentConfig<Props>
): ComponentConfig<Props> {
  return config;
}

/**
 * Component registry — keyed by `componentId` (last slash-segment of
 * `component.sys.urn`).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Components = Record<string, Registration<any>>;

/**
 * Experience Template registry — keyed by `experienceTemplateId` (last
 * slash-segment of an Experience Template node's own
 * `experienceTemplate.sys.urn`). Not read from `payload.sys`; templates are
 * ordinary nodes.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ExperienceTemplates = Record<string, ExperienceTemplateRegistration<any>>;

export interface Config {
  components: Components;
  experienceTemplates?: ExperienceTemplates;
  /**
   * Resolves `DesignToken` values to runtime values before they reach a
   * component. If omitted, they pass through unchanged. See `ResolveToken`
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

export function normalizeExperienceTemplateRegistration<P extends object>(
  reg: ExperienceTemplateRegistration<P>
): ExperienceTemplateConfig<P> {
  if (typeof reg === 'function') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { component: reg as Component<any> } as ExperienceTemplateConfig<P>;
  }
  return reg;
}
