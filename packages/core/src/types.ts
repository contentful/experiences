/**
 * Per-render runtime context attached to every customer component as the
 * `experience` prop, and passed to every `resolveData` hook as `ctx.experience`.
 * The conventional, single injection point — kept small at v1.
 *
 * `viewports` (the *list*) is here so customer resolvers can inspect what
 * viewports an Experience declares (e.g. "is there a mobile viewport?").
 * The *active* viewport is render-time only and lives on the framework
 * adapter's RenderContext — exposing it here would mean async resolvers
 * re-fire on every viewport change, which would be a footgun.
 *
 * `debug` is the single observability switch. When on it: emits verbose logs
 * from `resolveExperience` and `fetchExperience`; renders the visible
 * missing-component box (see the adapters' `MissingComponent`); and turns the
 * default `renderUnknown` fallback into the richer debug component. One boolean
 * threads through both fetch and render, so a customer can't enable one half
 * and be confused by the other.
 */
export interface ExperienceContext {
  debug: boolean;
  metadata: Record<string, unknown>;
  viewports: ViewportDef[];
}

/**
 * One viewport definition from a delivered Experience. The `query` is the
 * Contentful media-query DSL ("*" | "<992px" | ">1200px"), not raw CSS.
 *
 * The first viewport in the list is conventionally the wildcard ("*") that
 * always matches. The viewport order encodes the cascade direction —
 * desktop-first (descending) or mobile-first (ascending).
 */
export interface ViewportDef {
  id: string;
  query: string;
  displayName: string;
  previewSize: string;
}

/**
 * Discriminated design-property value as it arrives from XDA. v1 accepts:
 *  - ManualDesignValue: an explicit scalar (no viewport involved).
 *  - ValuesByViewport: a viewport-keyed map where each entry is itself a
 *                      ManualDesignValue or DesignToken.
 *  - DesignToken: a token reference, passed through to customer components
 *                 as-is for v1. Resolution lands in the future tokens package.
 */
export type DesignPropValue = ManualDesignValue | DesignToken | ValuesByViewport;

export interface ManualDesignValue {
  type: 'ManualDesignValue';
  value: string | number | boolean;
}

export interface DesignToken {
  type: 'DesignToken';
  value: string;
}

/**
 * Turns a `DesignToken` into a runtime value. `ref.value` is the
 * customer-defined token id; returning `undefined` means "not resolvable" and
 * the adapter drops the key (with a warning). Sync only — it runs at render time.
 */
export type ResolveToken = (ref: DesignToken) => unknown;

export interface ValuesByViewport {
  type: 'ValuesByViewport';
  values: Record<string, ManualDesignValue | DesignToken>;
}

/**
 * Resource-link reference to a registered Component. The `urn` carries
 * the component id; the build-plan extracts the id by taking the segment after
 * the last slash.
 *
 * Mirrors `ComponentLink` from `@contentful/experience-delivery`.
 */
export interface ComponentRef {
  sys: {
    type: 'ResourceLink';
    linkType: 'Contentful:Component';
    urn: string;
  };
}

/**
 * Resource-link reference to an Experience Template. The `urn` carries the
 * template id, extracted the same way as a component id (segment after the
 * last slash).
 *
 * Mirrors `ExperienceTemplateLink` from `@contentful/experience-delivery`.
 */
export interface ExperienceTemplateRef {
  sys: {
    type: 'ResourceLink';
    linkType: 'Contentful:ExperienceTemplate';
    urn: string;
  };
}

/**
 * One node from `HydratedExperienceView.nodes` (or any `slots[name]`).
 * Discriminated by which of `component` / `experienceTemplate` is present.
 *
 * Mirrors `RenamedHydratedTreeNode` from `@contentful/experience-delivery`.
 */
export type ExperienceNode = ComponentNode | ExperienceTemplateNode;

/** Mirrors `RenamedComponentTreeNode` from `@contentful/experience-delivery`. */
export interface ComponentNode {
  component: ComponentRef;
  id?: string;
  contentProperties?: Record<string, unknown>;
  designProperties?: Record<string, DesignPropValue>;
  slots?: Record<string, ExperienceNode[]>;
  contentBindings?: string;
}

/** Mirrors `RenamedTemplateTreeNode` from `@contentful/experience-delivery`. */
export interface ExperienceTemplateNode {
  experienceTemplate: ExperienceTemplateRef;
  id?: string;
  contentProperties?: Record<string, unknown>;
  designProperties?: Record<string, DesignPropValue>;
  slots?: Record<string, ExperienceNode[]>;
  contentBindings?: string;
}

/**
 * Top-level `sys` block on an Experience payload. The bits the SDK actually
 * reads are typed; everything else is left loose because the upstream
 * type carries dozens of editor/audit fields the renderer doesn't care about.
 *
 * Mirrors the parts of `RenamedDeliveryExperienceSys` the renderer reads.
 */
export interface ExperienceSys {
  /**
   * Editorial link to the Experience Template this Experience was authored
   * from. The renderer does NOT read this — it is present on every Experience
   * (both coded and composite templates), so it carries no signal about
   * whether a template should wrap anything. Rendering is driven entirely by
   * `nodes`: an `ExperienceTemplateNode` there means "render this coded
   * template"; its absence means the template was composite and the nodes are
   * plain components. Typed here only so payloads round-trip.
   */
  experienceTemplate?: ExperienceTemplateRef;
  [key: string]: unknown;
}

/**
 * Top-level Experience payload as returned by the Experience Delivery API
 * (`HydratedExperienceView` from `@contentful/experience-delivery`).
 *
 * Structurally compatible with the upstream type — no normalization step
 * required when consuming a delivery-client response. The delivery API returns
 * this shape when the request carries the
 * `x-contentful-enable-alpha-feature: new-exo-entity-types` header, which
 * `@contentful/experience-delivery` sends on every request.
 */
export interface ExperiencePayload {
  viewports: ViewportDef[];
  nodes: ExperienceNode[];
  errors?: unknown[];
  extensions?: unknown;
  sys?: ExperienceSys;
}

/**
 * Per-node context handed to a component's `resolveData` resolver. Carries
 * the raw content + design props from the payload (design properties are NOT
 * pre-resolved against a viewport — viewport resolution stays a render-time
 * concern so client viewport changes don't re-trigger async resolvers).
 */
export interface ResolveContext {
  content: Record<string, unknown>;
  design: Record<string, DesignPropValue>;
  experience: ExperienceContext;
}

/**
 * Registration metadata for a single instance — the SDK's interpreted
 * pointer to the customer's implementation. Carries the resolved id plus the
 * registry that id belongs to; capabilities (state requirements, supported
 * events, lifecycle hints, fallback ids) land here when needed.
 *
 * `kind` tells the adapter which registry to look `id` up in:
 * `'component'` → `Config.components`, `'experienceTemplate'` →
 * `Config.experienceTemplates`. Everything else about a node is identical
 * across the two kinds — a coded Experience Template is just a node whose
 * implementation lives in the other registry.
 */
export interface PortableRegistration {
  kind: 'component' | 'experienceTemplate';
  id: string;
}

/**
 * The IR — one node per component or Experience Template instance. The seam
 * that lets non-React adapters (Angular, SwiftUI, Compose) consume the same
 * interpretation.
 *
 * Design props preserve the discriminated value shape as they arrived. Adapters
 * unwrap to plain scalars at render time, given an active viewport.
 * (DesignToken values pass through unwrapped — customer components decide
 * how to resolve them in v1.)
 *
 * `props.resolved` is populated by `resolveExperience` from any
 * customer-supplied `resolveData` resolver and merged into the final props
 * after content + design but before slot props.
 *
 * `props.design` is the server pre-resolution of design against the plan's
 * fallback viewport; the raw per-viewport form stays on `props.designRaw` so
 * the client can re-resolve when the active viewport differs. See the fields
 * below.
 */
export interface PortableRenderNode {
  /**
   * Optional. Passed through from the XDA payload's `id` field when the
   * editor supplies one. The SDK does NOT auto-generate ids; adapters fall
   * back to the array index for React keys / debug labels when absent.
   */
  nodeId?: string;
  registration: PortableRegistration;
  props: {
    content: Record<string, unknown>;
    /** Flat, viewport-cascaded, token-resolved design values (server-side). */
    design: Record<string, unknown>;
    resolved?: Record<string, unknown>;
    /** Raw per-viewport design, for client re-resolution on viewport change. */
    designRaw: Record<string, DesignPropValue>;
  };
  /**
   * Slot children keyed by slot name, pre-built in payload order. Adapters
   * pass each entry to the customer's implementation as a prop of the same
   * name — a slot named `content` becomes a `content` prop. `children` is not
   * special; it is simply the conventional default slot name.
   */
  slots: Record<string, PortableRenderNode[]>;
}

/**
 * The interpreted experience tree.
 *
 * Top-level is `nodes: PortableRenderNode[]` (array, not single root) to
 * match the actual XDA payload shape. Renderers iterate top-level nodes and
 * recurse into `node.slots`. A coded Experience Template shows up as a
 * top-level node with `registration.kind === 'experienceTemplate'`, so there
 * is no plan-level template concept — see `PortableRegistration`.
 */
export interface PortableRenderPlan {
  viewports: ViewportDef[];
  nodes: PortableRenderNode[];
  /**
   * Viewport index the server pre-resolved design against (viewport[0] by
   * default). Adapters use `props.design` as-is when their active viewport
   * matches this, and recompute from `props.designRaw` otherwise.
   */
  fallbackViewportIndex: number;
}
