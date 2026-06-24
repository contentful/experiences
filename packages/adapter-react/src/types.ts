import type { ReactNode } from 'react';

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
 * Surfaced on the `contentful` prop of the template's render fn.
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
 * This type is React-adapter-specific. Other adapters (SwiftUI, Compose,
 * Angular, …) will define their own equivalents using the platform's idiomatic
 * primitive for "current viewport"; the SDK's runtime-neutral core deliberately
 * does not carry an `activeViewport` because each framework computes it
 * differently (`matchMedia`, `@Environment`, `LocalConfiguration`, etc.).
 *
 * Common uses:
 *  - Branching renders by viewport (`if (experience.activeViewport.id === 'mobile') ...`)
 *  - Reading viewport metadata (e.g. `displayName`, `previewSize`) for analytics
 *  - Disabling features on small screens
 *
 * Customers do NOT need this for design-prop resolution — those are already
 * pre-resolved to plain scalars by the renderer before reaching `render`.
 */
export interface RenderContext extends ExperienceContext {
  /** The currently active viewport — last-matching media query / device trait. */
  activeViewport: ViewportDef;
  /** Index of `activeViewport` in `viewports`. */
  activeViewportIndex: number;
}

/**
 * Props that flow into every customer component. Composed from seven sources,
 * spread last-wins by `nodes-renderer`:
 *
 *   1. defaults                    (componentConfig.defaults)
 *   2. content properties           (editorial values from XDA)
 *   3. resolved design properties   (viewport-cascade unwrapped to scalars)
 *   4. resolved data                (return value of componentConfig.resolveData)
 *   5. slot props                   (each named slot becomes a pre-rendered subtree)
 *   6. `experience`                 (RenderContext — runtime context + active viewport)
 *   7. `contentful`                 (the raw Contentful-side payload — see `ContentfulComponent`)
 *
 * Last-wins precedence means a slot named `text` would shadow a content
 * property named `text` would shadow a `resolveData` return field named
 * `text`. Keep the names you author distinct.
 */
export type ComponentProps<Props extends object> = Props & {
  experience: RenderContext;
  contentful: ContentfulComponent;
};

/**
 * Customer-supplied configuration for a single component type. Author with
 * `defineComponent<Props>(...)` for full type inference inside `render` and
 * `resolveData`.
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
   * during the React pass.
   */
  resolveData?: (ctx: ResolveContext) => Partial<Props> | Promise<Partial<Props>>;
  /**
   * Required. Pure render of the final composed props.
   */
  render: (props: ComponentProps<Props>) => ReactNode;
}

/**
 * Props passed to a template's render fn — its declared `Props` plus a
 * fixed `children` (the rendered experience nodes) and the `experience`
 * runtime context (RenderContext, with active viewport). Templates wrap
 * the experience; their `render` decides how the page-level chrome
 * surrounds the rendered tree.
 */
export type TemplateProps<Props extends object> = Props & {
  children: ReactNode;
  experience: RenderContext;
  contentful: ContentfulTemplate;
};

/**
 * Customer-supplied configuration for a single page-level template. Author
 * with `defineTemplate<Props>(...)`. Templates carry the same defaults +
 * resolveData shape as components — the only structural difference is that
 * a template's render fn always receives a `children: ReactNode` (the
 * rendered experience nodes).
 */
export interface TemplateConfig<Props extends object = Record<string, unknown>> {
  defaults?: Partial<Props>;
  resolveData?: (ctx: ResolveContext) => Partial<Props> | Promise<Partial<Props>>;
  render: (props: TemplateProps<Props>) => ReactNode;
}

/**
 * Identity helper — returns the template config as-is, but narrows the
 * `render` and `resolveData` parameter types to your declared `Props`.
 *
 * @example
 *   interface PageTemplateProps {
 *     title?: string;
 *   }
 *
 *   export const Page = defineTemplate<PageTemplateProps>({
 *     defaults: { title: 'Untitled' },
 *     render: ({ title, children }) => (
 *       <main>
 *         <h1>{title}</h1>
 *         {children}
 *       </main>
 *     ),
 *   });
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
 *
 * Per-component prop narrowing happens at `defineComponent<Props>(...)`
 * authoring time, not at dispatch time, since the renderer looks up by
 * string key — that's why the value type erases per-component props.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- per-entry narrowing happens at defineComponent authoring time.
export type Components = Record<string, ComponentConfig<any>>;

/**
 * Template registry shape — keyed by `templateId` (the segment after the
 * last slash in `payload.sys.template.sys.urn`). Use this type to annotate
 * a standalone `templates` const before composing it into `Config`.
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
 * `render` and `resolveData` parameter types to your declared `Props` so
 * destructuring inside those functions is fully typed without manual casts.
 *
 * @example
 *   interface ButtonProps {
 *     text?: string;
 *     url?: string;
 *     type?: 'primary' | 'secondary';
 *   }
 *
 *   export const Button = defineComponent<ButtonProps>({
 *     defaults: { type: 'primary' },
 *     resolveData: ({ content, experience }) => ({
 *       url: localize(content.url, experience.metadata.locale),
 *     }),
 *     render: ({ text, url, type }) => (
 *       <a href={url} className={`btn btn-${type}`}>{text}</a>
 *     ),
 *   });
 */
export function defineComponent<Props extends object = Record<string, unknown>>(
  config: ComponentConfig<Props>
): ComponentConfig<Props> {
  return config;
}
