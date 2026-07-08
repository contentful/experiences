import type { ComponentType, ReactNode } from 'react';

import type {
  DesignPropValue,
  ExperienceContext,
  ResolveContext,
  ViewportDef,
} from '@contentful/experiences-core';

/**
 * Re-exported for ergonomics: customer code authoring `resolveData` doesn't
 * have to dig into the core package for the context type.
 */
export type { ResolveContext };

/**
 * The full Contentful-side payload for a single component instance, exposed
 * via `useContentfulComponent()` to any descendant of a rendered Experience
 * node. Useful for:
 *
 *  - Custom design-property resolution outside the SDK's default cascade
 *  - Branching by `componentTypeId` in a generic wrapper component
 *  - Attaching analytics to specific node ids
 *  - Debugging — rendering a `<details>` block with the raw payload in preview
 *
 * Design properties stay in their **raw envelope form** here (the same shape
 * `ctx.design` carries inside `resolveData`). The flat scalars merged into
 * top-level props are what `resolveDesignProperties` produced after viewport
 * cascade. This is the unprocessed input; the spread props are the processed
 * output.
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
 * the active viewport — info that only exists at render time, not at
 * `resolveData` time (resolvers run once before viewport resolution; viewport
 * changes on the client should not re-trigger resolvers).
 *
 * Exposed via `useExperience()` to any descendant of the renderer.
 */
export interface RenderContext extends ExperienceContext {
  activeViewport: ViewportDef;
  activeViewportIndex: number;
}

/**
 * Customer-supplied configuration for a single component type. The `component`
 * is a plain React component — it receives only the props you'd expect from
 * the payload (content + design + resolveData merged, plus any slot subtrees).
 * The Experience runtime context and the raw Contentful payload are NOT
 * injected as props; reach for them via `useExperience()` and
 * `useContentfulComponent()` when you need them.
 */
export interface ComponentConfig<Props extends object = Record<string, unknown>> {
  /**
   * Lowest-precedence prop bag. Merged in before content / design / resolveData /
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
   * The React component to render. Receives the merged prop bag with no
   * SDK-shaped extras spread in.
   */
  component: ComponentType<Props>;
}

/**
 * Registry value. Customers can register a bare React component for the
 * common case, or the full `ComponentConfig` shape when they need defaults
 * or a `resolveData` hook.
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
 * `componentType.sys.urn`). Per-entry prop narrowing happens at the
 * `defineComponent<Props>` call site (or implicitly when the bare component
 * shorthand is used).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- per-entry narrowing happens at defineComponent / component-type author time.
export type Components = Record<string, Registration<any>>;

/**
 * Template registry — keyed by `templateId` (last slash-segment of
 * `payload.sys.template.sys.urn`).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- per-entry narrowing happens at defineTemplate / template author time.
export type Templates = Record<string, TemplateRegistration<any>>;

export interface Config {
  components: Components;
  templates?: Templates;
}

/**
 * Normalize a registry entry — bare component OR config object — into the
 * common `ComponentConfig` shape used by the renderer. Exported for tests
 * and for adapters that want to introspect the registry.
 *
 * React function components are functions; `React.memo` / `React.forwardRef`
 * yield objects with a `$$typeof` symbol. Both qualify as "bare component"
 * for our purposes — the discriminator is the presence of a literal
 * `component` field with no `$$typeof`.
 */
export function normalizeComponentRegistration<P extends object>(
  reg: Registration<P>
): ComponentConfig<P> {
  if (
    typeof reg === 'object' &&
    reg !== null &&
    !('$$typeof' in reg) &&
    'component' in reg
  ) {
    return reg as ComponentConfig<P>;
  }
  return { component: reg as ComponentType<P> };
}

export function normalizeTemplateRegistration<P extends object>(
  reg: TemplateRegistration<P>
): TemplateConfig<P> {
  if (
    typeof reg === 'object' &&
    reg !== null &&
    !('$$typeof' in reg) &&
    'component' in reg
  ) {
    return reg as TemplateConfig<P>;
  }
  return { component: reg as ComponentType<P & { children?: ReactNode }> };
}
