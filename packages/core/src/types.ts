/**
 * Per-render runtime context. Read through the adapter's accessor
 * (`useExperience()` / `getExperience()` / `injectExperience()`), and passed to
 * every `resolveData` hook as `ctx.experience`. Never spread onto component
 * props — components receive only the props they declare.
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
  /**
   * Free-form pass-through for application data. The SDK never writes a key
   * here. Untyped on purpose — narrow at the read site.
   *
   * Must be plain serializable data: it rides on `PortableRenderPlan`, which
   * crosses server/client boundaries.
   */
  metadata: Record<string, unknown>;
}

/** Render-time context is the same plain data supplied to `resolveData`. */
export type RenderContext = ExperienceContext;

/**
 * Discriminated design-property value as it arrives from XDA. v1 accepts:
 *  - ManualDesignValue: an explicit scalar.
 *  - DesignToken: a token reference resolved while building the render plan.
 */
export type DesignPropValue = ManualDesignValue | DesignToken;

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
 * customer-defined token id; returning `undefined` retains the raw token and
 * records a diagnostic. Sync only — it runs while building the render plan.
 */
export type ResolveToken = (ref: DesignToken) => unknown;

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
 * Content source map, returned under `extensions.sourceMap` when the request
 * opts in. The SDK passes it through without interpreting it, so collections
 * stay `unknown[]` — `core` takes no dependency on the delivery client. Narrow
 * with `ContentfulViewDelivery.HydratedExperienceViewExtensionsSourceMap`.
 *
 * Mirrors `HydratedExperienceViewExtensionsSourceMap`.
 */
export interface ExperienceSourceMap {
  version: number;
  variants: unknown[];
  spaces: string[];
  environments: string[];
  locales: string[];
  entries: unknown[];
  assets: unknown[];
  layers: unknown[];
  dataAssemblies: unknown[];
  nodes: Record<string, unknown>;
}

/**
 * XDA response extensions consumed by the SDK. Kept as a structural subset of
 * `HydratedExperienceViewExtensions` so Core remains dependency-free.
 */
export interface ExperienceExtensions {
  personalization?: {
    /** Optional here so hand-authored and partial payloads remain accepted. */
    profile?: {
      id?: string;
    };
    experiences?: unknown[];
    changes?: unknown[];
  };
  sourceMap?: ExperienceSourceMap;
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
  nodes: ExperienceNode[];
  errors?: unknown[];
  extensions?: ExperienceExtensions;
  sys?: ExperienceSys;
}

/**
 * Per-node context handed to a component's `resolveData` resolver. Carries
 * the raw content + design props from the payload.
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
 * Design props preserve the discriminated value shape as they arrived. Token
 * resolution happens when the plan is built, before any framework renderer
 * reads the values.
 *
 * `props.resolved` is populated by `resolveExperience` from any
 * customer-supplied `resolveData` resolver and merged into the final props
 * after content + design but before slot props.
 *
 * `props.design` contains values ready for the renderer; `props.designRaw`
 * preserves the source values for `resolveData` and payload context helpers.
 */
export interface PortableRenderNode {
  /**
   * Reportable scopes this node belongs to. Present only when the plan carries
   * a usable source map and the node's id is in it.
   */
  attribution?: NodeAttribution;
  /**
   * Optional. Passed through from the XDA payload's `id` field when the
   * editor supplies one. The SDK does NOT auto-generate ids; adapters fall
   * back to the array index for React keys / debug labels when absent.
   */
  nodeId?: string;
  registration: PortableRegistration;
  props: {
    content: Record<string, unknown>;
    /** Token-resolved design values. */
    design: Record<string, unknown>;
    resolved?: Record<string, unknown>;
    /** Design-property envelopes as delivered by XDA. */
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
 * One rendered occurrence of an Experience or persisted Fragment. Field names
 * follow the ExO event shape, so it stays structurally assignable to the
 * client's interaction-event builder args. Optional fields are omitted, never
 * invented: the baseline variant carries no `variantId`, `variantIndex` or
 * `optimizationId`.
 */
export interface ScopeAttribution {
  /** Opaque, plan-local occurrence key. Never parse it. */
  key: string;
  entityId: string;
  entityKind: 'Experience' | 'Fragment';
  entityKindId?: string;
  optimizationId?: string;
  variantId?: string;
  variantIndex?: number;
  parentExperienceId?: string;
  entryIds?: string[];
}

/** A node's own view of the scopes it belongs to. Plain data, safe to serialize. */
export interface NodeAttribution {
  /** Every reportable scope the node belongs to, outer to inner. Shared with `plan.attribution.scopes` and frozen. */
  scopes: ScopeAttribution[];
  /** The scopes this node is a top-level node of, i.e. its parent is not in them. */
  roots: ScopeAttribution[];
  /** Entries this node's own content properties are bound to. */
  entryIds?: string[];
}

/** Occurrence-keyed lookup of every reportable scope in a plan. */
export interface PlanAttribution {
  scopes: Record<string, ScopeAttribution>;
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
  nodes: PortableRenderNode[];
  /**
   * The `metadata` the resolve step ran with, so the renderer does not need it
   * passed again. The renderer's `metadata` prop merges over this. `{}` when
   * the caller passed none.
   */
  metadata: Record<string, unknown>;
  /** The `debug` flag the resolve step ran with. The renderer's prop overrides it. */
  debug: boolean;
  /** Present only when the fetch requested the `sourceMap` extension. */
  sourceMap?: ExperienceSourceMap;
  /** Reportable scopes resolved from `sourceMap`. Absent when there is no usable map. */
  attribution?: PlanAttribution;
  /** Present when XDA returned personalization state for this Experience. */
  personalization?: {
    /** Profile id to use for subsequent personalized requests. */
    profileId: string;
  };
  /**
   * Resolve-time diagnostics collected while building this plan — malformed
   * payload/slot shapes, an unidentifiable node, a failing `resolveData`, an
   * unresolved design token. Plain `Error`s: the message names the node/
   * component involved, and `resolve-data-failed`'s entry sets `.cause` to
   * the original thrown/rejected error so the real stack trace stays
   * reachable. Render-time diagnostics (unregistered id,
   * component-render-error) are NOT here — each adapter collects those per
   * render and merges both lists for `<DebugExperience>`.
   *
   * Note these are `Error` instances, so unlike the rest of the plan they do
   * not survive a server/client serialization boundary intact — see the
   * `metadata` note above. Adapters read them during the render that produced
   * them.
   */
  diagnostics: Error[];
}
