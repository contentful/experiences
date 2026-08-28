import type { ComponentType } from 'react';

import type {
  DesignPropValue,
  RenderContext,
  ResolveContext,
  ResolveToken,
} from '@contentful/experiences-sdk-core';

/**
 * Re-exported for ergonomics: customer code authoring `resolveData` doesn't
 * have to dig into the core package for the context type.
 */
export type { ResolveContext, ResolveToken };

/**
 * The full Contentful-side payload for a single component instance, exposed
 * via `useContentfulComponent()` to any descendant of a rendered Experience
 * node. Useful for custom design-property resolution outside the SDK's
 * cascade, branching by `componentId` in a generic wrapper, keying
 * analytics on `nodeId`, or rendering a raw-payload panel in preview.
 *
 * Design properties stay in their **raw discriminated form** here (the same
 * shape `ctx.design` carries inside `resolveData`). The viewport-cascaded,
 * token-resolved values are what `useDesignValues()` returns.
 */
export interface ContentfulComponent {
  componentId: string;
  nodeId?: string;
  content: Record<string, unknown>;
  design: Record<string, DesignPropValue>;
  resolved?: Record<string, unknown>;
}

/**
 * Same shape as `ContentfulComponent`, but for an Experience Template node.
 * Exposed via `useContentfulExperienceTemplate()` inside an Experience
 * Template's component tree.
 */
export interface ContentfulExperienceTemplate {
  experienceTemplateId: string;
  nodeId?: string;
  content: Record<string, unknown>;
  design: Record<string, DesignPropValue>;
  resolved?: Record<string, unknown>;
}

/** Render-time experience context, read with `useExperience()`. Declared in core so all adapters share one shape. */
export type { RenderContext };

/**
 * Customer-supplied configuration for a single component. The `component`
 * receives the merged props (design + content + resolveData + slots); resolved
 * design values auto-fill matching props and are also readable via
 * `useDesignValues()`. Runtime context and raw payload come from
 * `useExperience()` / `useContentfulComponent()`.
 */
export interface ComponentConfig<Props extends object = Record<string, unknown>> {
  /**
   * Lowest-precedence defaults object. Merged in before content / resolveData /
   * slots. Useful for variant fallbacks the editorial layer doesn't always supply.
   */
  defaults?: Partial<Props>;
  /**
   * Optional sync-or-async hook that derives final props from the raw
   * Experience inputs. Runs once during `resolveExperience`, before render —
   * does NOT re-fire on viewport changes.
   */
  resolveData?: (ctx: ResolveContext) => Partial<Props> | Promise<Partial<Props>>;
  /**
   * The React component to render. Receives the merged props.
   */
  component: ComponentType<Props>;
}

/**
 * Registry value. Register a bare React component for the common case, or
 * the full `ComponentConfig` shape when you need defaults or a `resolveData`
 * hook.
 *
 *   button: Button,                                  // bare
 *   header: { component: Header, defaults: {...} }, // with defaults
 *   card:   defineComponent<CardProps>({ component: Card, resolveData: ... }),
 */
export type Registration<Props extends object = Record<string, unknown>> =
  | ComponentType<Props>
  | ComponentConfig<Props>;

/**
 * Customer-supplied configuration for a coded Experience Template. Identical in
 * shape and behavior to `ComponentConfig` — an Experience Template is just a
 * node whose implementation lives in the `experienceTemplates` registry. Its
 * slots arrive as named props (a `content` slot becomes a `content` prop), so
 * there is no `children` special case.
 */
export interface ExperienceTemplateConfig<Props extends object = Record<string, unknown>> {
  /**
   * Lowest-precedence defaults object. Merged in before content / resolveData /
   * slots. Useful for variant fallbacks the editorial layer doesn't always supply.
   */
  defaults?: Partial<Props>;
  resolveData?: (ctx: ResolveContext) => Partial<Props> | Promise<Partial<Props>>;
  component: ComponentType<Props>;
}

/**
 * Registry value for Experience Templates. Same dual-shape as component
 * registrations.
 */
export type ExperienceTemplateRegistration<Props extends object = Record<string, unknown>> =
  | ComponentType<Props>
  | ExperienceTemplateConfig<Props>;

/**
 * Identity helper — returns the config as-is, but narrows the `resolveData`
 * and `component` parameter types to your declared `Props`.
 */
export function defineComponent<Props extends object = Record<string, unknown>>(
  config: ComponentConfig<Props>
): ComponentConfig<Props> {
  return config;
}

/**
 * Identity helper — returns the Experience Template config as-is, with `Props`
 * narrowing.
 */
export function defineExperienceTemplate<Props extends object = Record<string, unknown>>(
  config: ExperienceTemplateConfig<Props>
): ExperienceTemplateConfig<Props> {
  return config;
}

/**
 * Component registry — keyed by `componentId` (last slash-segment of
 * `component.sys.urn`). Per-entry prop narrowing happens at
 * `defineComponent<Props>` or at the bare-component's own type.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- per-entry narrowing happens at the registration author's call site.
export type Components = Record<string, Registration<any>>;

/**
 * Experience Template registry — keyed by `experienceTemplateId` (last
 * slash-segment of an Experience Template node's own
 * `experienceTemplate.sys.urn`). Not read from `payload.sys`; templates are
 * ordinary nodes.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- per-entry narrowing happens at the registration author's call site.
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
 * Normalize a registry entry — bare component OR config object — into the
 * common `ComponentConfig` shape used by the renderer.
 *
 * React function components are plain functions; `React.memo` /
 * `React.forwardRef` yield objects carrying a `$$typeof` symbol. Both count
 * as bare components; a config object is discriminated by having a
 * `component` field and no `$$typeof`.
 */
export function normalizeComponentRegistration<P extends object>(
  reg: Registration<P>
): ComponentConfig<P> {
  if (typeof reg === 'object' && reg !== null && !('$$typeof' in reg) && 'component' in reg) {
    return reg as ComponentConfig<P>;
  }
  return { component: reg as ComponentType<P> };
}

export function normalizeExperienceTemplateRegistration<P extends object>(
  reg: ExperienceTemplateRegistration<P>
): ExperienceTemplateConfig<P> {
  if (typeof reg === 'object' && reg !== null && !('$$typeof' in reg) && 'component' in reg) {
    return reg as ExperienceTemplateConfig<P>;
  }
  return { component: reg as ComponentType<P> };
}
