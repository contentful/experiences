/*
 * Port of the Svelte adapter's types, with `Component<any>` → `Type<unknown>`.
 *
 * Input declaration convention for this package: every component in `src/`
 * declares its inputs with the `@Input()` decorator plus a setter that writes
 * into a private signal, never with the signal-based `input()`.
 *
 * Signal inputs are AOT-only. Angular's JIT compiler builds a component def's
 * `inputs` map from decorator metadata and never scans class-field initializers,
 * so under JIT an `input()` field is invisible to `reflectComponentType()` and
 * `ComponentRef.setInput()` rejects it (NG0303). This suite runs on JIT — see
 * the note in vitest.config.ts — so the decorator form is load-bearing here.
 *
 * This constraint applies only to the adapter's own components and its test
 * fixtures. Customer-registered components are compiled by the customer's own
 * AOT build and may declare signal inputs freely: the renderer discovers them
 * with `reflectComponentType()` and assigns them with `setInput()`, both of
 * which are runtime APIs that read whatever the component def already carries.
 */

import type { Type } from '@angular/core';

import type {
  DesignPropValue,
  ExperienceContext,
  PortableRenderNode,
  ResolveContext,
  ResolveToken,
  ViewportDef,
} from '@contentful/experiences-sdk-core';

export type { ResolveContext, ResolveToken };

/**
 * The full Contentful-side payload for a single component instance, exposed
 * via `injectContentfulComponent()` to any descendant of a rendered Experience
 * node. Useful for custom design-property resolution outside the SDK's
 * cascade, branching by `componentId` in a generic wrapper, keying
 * analytics on `nodeId`, rendering a raw-payload panel in preview, or
 * re-rendering a slot's nodes yourself through the exported `<cf-nodes>`.
 *
 * Design properties stay in their **raw discriminated form** here (the same
 * shape `ctx.design` carries inside `resolveData`). The viewport-cascaded,
 * token-resolved values are what `injectDesignValues()` returns.
 */
export interface ContentfulComponent {
  componentId: string;
  nodeId?: string;
  content: Record<string, unknown>;
  design: Record<string, DesignPropValue>;
  resolved?: Record<string, unknown>;
  /**
   * Raw per-slot node arrays from the payload. Every slot is also passed as a
   * same-named `PortableRenderNode[]` input (`children` is not special); these
   * raw nodes are the same arrays, kept here for callers that reach a slot
   * through the context rather than through a declared input.
   */
  slots: Record<string, unknown>;
}

/**
 * Same shape as `ContentfulComponent`, but for an Experience Template node.
 * Exposed via `injectContentfulExperienceTemplate()` inside an Experience
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
 * Render-time experience context. Extends the core `ExperienceContext` with
 * the active viewport — a render-time value that resolvers cannot see.
 * Exposed via `injectExperience()`.
 */
export interface RenderContext extends ExperienceContext {
  activeViewport: ViewportDef;
  activeViewportIndex: number;
  /**
   * Viewport index the server pre-resolved design against (from
   * `PortableRenderPlan.fallbackViewportIndex`). Renderers use `props.design`
   * as-is when `activeViewportIndex` matches, and recompute otherwise. Always a
   * number — the plan field is required, so the match is a real comparison.
   */
  fallbackViewportIndex: number;
}

/**
 * Customer-supplied configuration for a single component type. The `component`
 * receives the merged props (design + content + resolveData + one
 * `PortableRenderNode[]` input per slot); resolved design values auto-fill
 * matching inputs and are also readable via `injectDesignValues()`. Runtime
 * context and raw payload come from `injectExperience()` /
 * `injectContentfulComponent()`.
 *
 * Only keys the component declares as inputs are assigned — see
 * `Registration` and the README's parity table.
 */
export interface ComponentConfig<Props extends object = Record<string, unknown>> {
  defaults?: Partial<Props>;
  resolveData?: (ctx: ResolveContext) => Partial<Props> | Promise<Partial<Props>>;
  component: Type<unknown>;
}

/**
 * Registry value. Register a bare Angular component class for the common case,
 * or the full `ComponentConfig` shape when you need defaults or a `resolveData`
 * hook.
 *
 *   button: ButtonComponent,                                 // bare
 *   header: { component: HeaderComponent, defaults: {...} },  // with defaults
 *   card:   defineComponent<CardProps>({ component: CardComponent, resolveData: ... }),
 */
export type Registration<Props extends object = Record<string, unknown>> =
  | Type<unknown>
  | ComponentConfig<Props>;

/**
 * Customer-supplied configuration for a coded Experience Template. Identical in
 * shape and behavior to `ComponentConfig` — an Experience Template is just a
 * node whose implementation lives in the `experienceTemplates` registry. Its
 * slots arrive as named `PortableRenderNode[]` inputs (a `content` slot becomes
 * a `content` input), so there is no `children` special case.
 */
export interface ExperienceTemplateConfig<Props extends object = Record<string, unknown>> {
  defaults?: Partial<Props>;
  resolveData?: (ctx: ResolveContext) => Partial<Props> | Promise<Partial<Props>>;
  component: Type<unknown>;
}

export type ExperienceTemplateRegistration<Props extends object = Record<string, unknown>> =
  | Type<unknown>
  | ExperienceTemplateConfig<Props>;

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
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- registry values are heterogeneous; each entry's Props is its own.
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
 * Normalize a registry entry — bare Angular component class OR config object —
 * into the common `ComponentConfig` shape used by the renderer. Component
 * classes are functions; config objects are plain objects with a `component`
 * field, so `typeof` is enough to discriminate.
 */
export function normalizeComponentRegistration<P extends object>(
  reg: Registration<P>
): ComponentConfig<P> {
  if (typeof reg === 'function') {
    return { component: reg as Type<unknown> } as ComponentConfig<P>;
  }
  return reg;
}

export function normalizeExperienceTemplateRegistration<P extends object>(
  reg: ExperienceTemplateRegistration<P>
): ExperienceTemplateConfig<P> {
  if (typeof reg === 'function') {
    return { component: reg as Type<unknown> } as ExperienceTemplateConfig<P>;
  }
  return reg;
}

/**
 * Renders the unregistered-component placeholder. Receives `componentId` and
 * `nodeId` inputs; anything it does not declare is dropped, same as any other
 * rendered component.
 */
export type RenderUnknown = Type<unknown>;

/** Convenience alias — the slot input shape customer components declare. */
export type SlotNodes = PortableRenderNode[];
