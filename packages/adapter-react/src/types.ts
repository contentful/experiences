import type { ComponentType, ReactNode } from 'react';

import type {
  DesignPropValue,
  ExperienceContext,
  ResolveContext,
  ResolveToken,
  ViewportDef,
} from '@contentful/experiences-core';

/**
 * Re-exported for ergonomics: customer code authoring `resolveData` doesn't
 * have to dig into the core package for the context type.
 */
export type { ResolveContext, ResolveToken };

/**
 * The full Contentful-side payload for a single component instance, exposed
 * via `useContentfulComponent()` to any descendant of a rendered Experience
 * node. Useful for custom design-property resolution outside the SDK's
 * cascade, branching by `componentTypeId` in a generic wrapper, keying
 * analytics on `nodeId`, or rendering a raw-payload panel in preview.
 *
 * Design properties stay in their **raw envelope form** here (the same shape
 * `ctx.design` carries inside `resolveData`). The viewport-cascaded, token-
 * resolved values are what `useDesignValues()` returns.
 */
export interface ContentfulComponent {
  componentTypeId: string;
  nodeId?: string;
  content: Record<string, unknown>;
  design: Record<string, DesignPropValue>;
  resolved?: Record<string, unknown>;
}

/**
 * Same shape as `ContentfulComponent`, but for the page-level template.
 * Exposed via `useContentfulTemplate()` inside a template's component tree.
 */
export interface ContentfulTemplate {
  templateId: string;
  content: Record<string, unknown>;
  design: Record<string, DesignPropValue>;
  resolved?: Record<string, unknown>;
}

/**
 * Render-time experience context. Extends the core `ExperienceContext` with
 * the active viewport — a render-time value that resolvers cannot see (they
 * run once before viewport resolution and are not re-triggered by viewport
 * changes). Exposed via `useExperience()` to any descendant of the renderer.
 */
export interface RenderContext extends ExperienceContext {
  activeViewport: ViewportDef;
  activeViewportIndex: number;
}

/**
 * Customer-supplied configuration for a single component type. The `component`
 * receives the merged prop bag (content + resolveData + slots). Design values
 * are not injected — a component reads them via `useDesignValues()`. Runtime
 * context and raw payload come from `useExperience()` / `useContentfulComponent()`.
 */
export interface ComponentConfig<Props extends object = Record<string, unknown>> {
  /**
   * Lowest-precedence prop bag. Merged in before content / resolveData /
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
   * The React component to render. Receives the merged prop bag as its props.
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
 * Customer-supplied configuration for a page-level template. The template's
 * component receives the rendered Experience nodes as `children`.
 */
export interface TemplateConfig<Props extends object = Record<string, unknown>> {
  defaults?: Partial<Props>;
  resolveData?: (ctx: ResolveContext) => Partial<Props> | Promise<Partial<Props>>;
  component: ComponentType<Props & { children?: ReactNode }>;
}

/**
 * Registry value for templates. Same dual-shape as component registrations.
 */
export type TemplateRegistration<Props extends object = Record<string, unknown>> =
  | ComponentType<Props & { children?: ReactNode }>
  | TemplateConfig<Props>;

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
 * Identity helper — returns the template config as-is, with `Props` narrowing.
 */
export function defineTemplate<Props extends object = Record<string, unknown>>(
  config: TemplateConfig<Props>
): TemplateConfig<Props> {
  return config;
}

/**
 * Component registry — keyed by `componentTypeId` (last slash-segment of
 * `componentType.sys.urn`). Per-entry prop narrowing happens at
 * `defineComponent<Props>` or at the bare-component's own type.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- per-entry narrowing happens at the registration author's call site.
export type Components = Record<string, Registration<any>>;

/**
 * Template registry — keyed by `templateId` (last slash-segment of
 * `payload.sys.template.sys.urn`).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- per-entry narrowing happens at the registration author's call site.
export type Templates = Record<string, TemplateRegistration<any>>;

export interface Config {
  components: Components;
  templates?: Templates;
  /**
   * Resolves `DesignToken` envelopes to runtime values before they reach a
   * component. If omitted, envelopes pass through unchanged. See `ResolveToken`
   * in `@contentful/experiences-core` for the full contract.
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

export function normalizeTemplateRegistration<P extends object>(
  reg: TemplateRegistration<P>
): TemplateConfig<P> {
  if (typeof reg === 'object' && reg !== null && !('$$typeof' in reg) && 'component' in reg) {
    return reg as TemplateConfig<P>;
  }
  return { component: reg as ComponentType<P & { children?: ReactNode }> };
}
