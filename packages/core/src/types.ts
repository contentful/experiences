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
 */
export interface ExperienceContext {
  isPreview: boolean;
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
 *  - ValuesByViewport: a viewport-keyed bag where each entry is itself a
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
 * Turns a `DesignToken` envelope into a runtime value. `ref.value` is the
 * customer-defined token id; returning `undefined` means "not resolvable" and
 * the adapter drops the key (with a warning). Sync only — it runs at render time.
 */
export type ResolveToken = (ref: DesignToken) => unknown;

export interface ValuesByViewport {
  type: 'ValuesByViewport';
  values: Record<string, ManualDesignValue | DesignToken>;
}

/**
 * Resource-link reference to a registered Component Type. The `urn` carries
 * the type id; the build-plan extracts the id by taking the segment after
 * the last slash.
 */
export interface ComponentTypeRef {
  sys: {
    type: 'ResourceLink';
    linkType: 'Contentful:ComponentType';
    urn: string;
  };
}

/**
 * Resource-link reference to a Template. Templates are out of v1 scope and
 * are skipped at plan-build time with a diagnostic.
 */
export interface TemplateRef {
  sys: {
    type: 'ResourceLink';
    linkType: 'Contentful:Template';
    urn: string;
  };
}

/**
 * One node from `GetExperienceViewResponse.nodes` (or any `slots[name]`).
 * Discriminated by which of `componentType` / `template` is present.
 */
export type ExperienceNode = ComponentTypeNode | TemplateNode;

export interface ComponentTypeNode {
  componentType: ComponentTypeRef;
  id?: string;
  contentProperties?: Record<string, unknown>;
  designProperties?: Record<string, DesignPropValue>;
  slots?: Record<string, ExperienceNode[]>;
  contentBindings?: string;
}

export interface TemplateNode {
  template: TemplateRef;
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
 */
export interface ExperienceSys {
  /**
   * Optional page-level template reference. When present, the renderer wraps
   * the experience nodes with the matching template registered in the
   * customer's Config. When absent, nodes render at the top level.
   */
  template?: TemplateRef;
  [key: string]: unknown;
}

/**
 * Top-level Experience payload as returned by the Experience Delivery API
 * (`GetExperienceViewResponse` from `@contentful/experience-delivery`).
 *
 * Structurally compatible with the upstream type — no normalization step
 * required when consuming a delivery-client response.
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
 * the raw content + design props from the payload (design envelopes are NOT
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
 * pointer to the customer's component implementation. Today carries only
 * the resolved component-type id; capabilities (state requirements,
 * supported events, lifecycle hints, fallback ids) land here when needed.
 */
export interface PortableRegistration {
  componentTypeId: string;
}

/**
 * The IR — one node per component instance. The seam that lets non-React
 * adapters (Angular, SwiftUI, Compose) consume the same interpretation.
 *
 * Design props preserve the discriminated envelope as they arrived. Adapters
 * unwrap to plain scalars at render time, given an active viewport.
 * (DesignToken envelopes pass through unwrapped — customer components decide
 * how to resolve them in v1.)
 *
 * `props.resolved` is populated by `resolveExperience` from any
 * customer-supplied `resolveData` resolver and merged into the final prop bag
 * after content + design but before slot props.
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
    design: Record<string, DesignPropValue>;
    resolved?: Record<string, unknown>;
  };
  slots: Record<string, PortableRenderNode[]>;
}

/**
 * Interpreted page-level template — the optional wrapper around the
 * experience tree. `templateId` is extracted from
 * `payload.sys.template.sys.urn` (last slash-segment).
 *
 * Templates carry the same prop-resolution shape as components: content +
 * design envelopes plus an optional `resolved` bag from a `resolveData` hook.
 * v1 payloads from XDA don't carry template-level content/design properties
 * yet, but the IR makes room for them so the API doesn't need to break later.
 */
export interface PortableTemplate {
  templateId: string;
  props: {
    content: Record<string, unknown>;
    design: Record<string, DesignPropValue>;
    resolved?: Record<string, unknown>;
  };
}

/**
 * The interpreted experience tree.
 *
 * Top-level is `nodes: PortableRenderNode[]` (array, not single root) to
 * match the actual XDA payload shape. Renderers iterate top-level nodes
 * and recurse into `node.slots`. When `template` is present, the renderer
 * wraps the nodes with the matching template config; otherwise nodes
 * render at the top level.
 */
export interface PortableRenderPlan {
  viewports: ViewportDef[];
  nodes: PortableRenderNode[];
  template?: PortableTemplate;
}
