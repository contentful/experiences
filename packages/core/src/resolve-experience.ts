/*
 * Single async entry that turns an XDA Experience payload into a
 * runtime-neutral PortableRenderPlan ready to render.
 *
 * v1 behavior:
 *  - Walk the payload's nodes recursively. Each ComponentType node becomes
 *    a PortableRenderNode with `registration.componentTypeId` extracted
 *    from `componentType.sys.urn` (last slash-segment).
 *  - Split content + design properties onto `node.props`. The raw per-viewport
 *    design properties (DesignToken / ManualDesignValue / ValuesByViewport) are
 *    preserved on `props.designRaw`; the design package unwraps them at render
 *    time. `props.design` holds the pre-resolved flat values (see below).
 *  - Template-variant nodes are skipped with a console.warn — out of v1 scope.
 *  - For every component whose registration declares `resolveData`, run the
 *    resolver (sync or async) in parallel with peers, and attach the result
 *    to `node.props.resolved`.
 *  - Unknown component-type-id is a render-time concern (handled by the
 *    framework adapter via `renderUnknown`); the IR still emits the node.
 *  - Pre-resolve design server-side against a fallback viewport (the
 *    configured `initialViewportId` / `config.fallbackViewportId`, else
 *    viewport[0]) onto `props.design`, so SSR paints correct design values on
 *    first render. The raw per-viewport form is preserved on `props.designRaw`.
 */

import { createDebugLogger, type DebugLogger } from './debug-logger';
import type {
  ComponentTypeNode,
  DesignPropValue,
  ExperienceContext,
  ExperienceNode,
  ExperiencePayload,
  PortableRenderNode,
  PortableRenderPlan,
  PortableTemplate,
  ResolveContext,
  ResolveToken,
  ViewportDef,
} from './types';
import { applyTokenResolver, getViewportIndex, resolveDesignProperties } from './viewport';

/**
 * Structural type the resolver walker depends on. Matches the React /
 * Svelte adapter `Config` shape but doesn't require importing them —
 * render-core stays decoupled from any framework.
 *
 * Registry values are typed as `unknown` because each adapter accepts
 * either a bare framework component (function / Svelte class / etc.) OR
 * a config-object shape with `{ component, defaults?, resolveData? }`.
 * The resolver only cares about `resolveData`; it duck-types each entry
 * at runtime and ignores anything without it.
 */
export interface ResolverConfig {
  components: Record<string, unknown>;
  templates?: Record<string, unknown>;
  /**
   * Resolves `DesignToken` design properties to runtime values. Mirrors the
   * adapter `Config.resolveToken` (the adapters pass their `Config` here), so
   * server and client agree without the caller re-supplying it. Consulted
   * during server-side design pre-resolution so the shipped `props.design`
   * values are fully resolved; the adapters still resolve tokens at render
   * time when recomputing from `props.designRaw`.
   */
  resolveToken?: ResolveToken;
  /**
   * Default fallback viewport for server-side design pre-resolution. Design
   * properties are always pre-resolved during resolve and shipped on
   * `props.design`, so SSR emits correct design values on first paint.
   * When set (and not overridden by `initialViewportId`), pre-resolution
   * cascades against this viewport; when unset, it defaults to viewport[0], the
   * first viewport in the payload's list.
   */
  fallbackViewportId?: string;
}

function getResolver(
  entry: unknown
):
  | ((ctx: ResolveContext) => Record<string, unknown> | Promise<Record<string, unknown>>)
  | undefined {
  if (typeof entry !== 'object' || entry === null) return undefined;
  const candidate = (entry as { resolveData?: unknown }).resolveData;
  return typeof candidate === 'function'
    ? (candidate as (
        ctx: ResolveContext
      ) => Record<string, unknown> | Promise<Record<string, unknown>>)
    : undefined;
}

export interface ResolveExperienceOptions {
  /**
   * Arbitrary per-render metadata exposed to every resolver as
   * `ctx.experience.metadata`. Flattened to a top-level option (was nested
   * under `experience`). Defaults to `{}`.
   */
  metadata?: Record<string, unknown>;
  /**
   * Observability switch. When on, `resolveExperience` logs the resolution
   * steps and per-node `resolveData` fan-out timings. Threads through to the
   * resolver context as `ctx.experience.debug`. Defaults to `false`.
   */
  debug?: boolean;
  /**
   * Per-request override for the server-side design pre-resolution fallback
   * viewport. Wins over `config.fallbackViewportId` — pass a value derived at
   * request time (e.g. a User-Agent-detected viewport) so pre-resolution
   * targets the device's expected viewport. When neither this nor
   * `config.fallbackViewportId` is set, pre-resolution defaults to viewport[0].
   * The id is resolved to an index via `getViewportIndex`, falling back to
   * viewport[0] when unknown. The raw `props.design` properties are always
   * preserved so the client re-resolves on viewport change.
   */
  initialViewportId?: string;
}

const DEFAULT_EXPERIENCE: ExperienceContext = {
  debug: false,
  metadata: {},
  viewports: [],
};

function isComponentTypeNode(node: ExperienceNode): node is ComponentTypeNode {
  return 'componentType' in node;
}

/**
 * Extract the flat id (componentType or template) from its `ResourceLink`
 * URN. Real URN shapes:
 *   crn:contentful:::experience:spaces/$self/environments/$self/componentTypes/<id>
 *   crn:contentful:::experience:spaces/$self/environments/$self/templates/<id>
 *
 * The id is the final path segment. We split on `/` and take the last
 * non-empty piece so this also tolerates trailing slashes or alternative
 * prefix shapes.
 */
function extractIdFromUrn(urn: string): string {
  const segments = urn.split('/').filter((s) => s.length > 0);
  return segments[segments.length - 1] ?? urn;
}

/**
 * Recursively turn a payload node into an IR node. The collected `nodeRefs`
 * array is for the resolver pass — every built node with a registered
 * resolver gets a reference appended so we can run them in parallel without
 * walking the tree twice.
 */
function buildNode(
  node: ExperienceNode,
  config: ResolverConfig,
  nodeRefs: PortableRenderNode[]
): PortableRenderNode | null {
  if (!isComponentTypeNode(node)) {
    if (typeof console !== 'undefined') {
      console.warn(
        '[@contentful/experiences-sdk-core] Skipping Template-variant node — Templates are not supported in v1.'
      );
    }
    return null;
  }

  const componentTypeId = extractIdFromUrn(node.componentType.sys.urn);

  const slots: Record<string, PortableRenderNode[]> = {};
  if (node.slots) {
    for (const [slotName, children] of Object.entries(node.slots)) {
      if (!Array.isArray(children)) {
        throw new TypeError(
          `Slot "${slotName}" on component "${componentTypeId}" must be an array of nodes.`
        );
      }
      const built: PortableRenderNode[] = [];
      for (const child of children) {
        const childNode = buildNode(child, config, nodeRefs);
        if (childNode === null) continue;
        built.push(childNode);
      }
      slots[slotName] = built;
    }
  }

  const built: PortableRenderNode = {
    registration: { componentTypeId },
    props: {
      content: { ...(node.contentProperties ?? {}) },
      // `design` holds the flat, resolved values written by the pre-resolution
      // pass below; start empty and keep the raw per-viewport form on `designRaw`.
      design: {},
      designRaw: { ...(node.designProperties ?? {}) } as Record<string, DesignPropValue>,
    },
    slots,
  };
  if (node.id) built.nodeId = node.id;
  if (getResolver(config.components[componentTypeId])) {
    nodeRefs.push(built);
  }
  return built;
}

/**
 * Cascade one node's raw design properties to the fallback viewport and resolve
 * any design tokens, mirroring what the adapters do at render time. Returns the
 * flat map of resolved design values plus the ids of any tokens `resolveToken`
 * left unresolved (dropped from the map). The raw `designRaw` properties are
 * left untouched by the caller.
 */
function preResolveDesignProperties(
  design: Record<string, DesignPropValue>,
  viewports: ViewportDef[],
  fallbackViewportIndex: number,
  resolveToken: ResolveToken | undefined
): { props: Record<string, unknown>; unresolved: string[] } {
  const cascaded = resolveDesignProperties(design, viewports, fallbackViewportIndex);
  return applyTokenResolver(cascaded, resolveToken);
}

/**
 * Warn (once per label) when `resolveToken` left tokens unresolved during
 * pre-resolution, so the dropped keys are diagnosable server-side — the adapters
 * consume the pre-resolved map as-is and no longer see the raw tokens to warn.
 */
function warnUnresolvedTokens(label: string, unresolved: string[], log: DebugLogger): void {
  if (!unresolved.length || typeof console === 'undefined') return;
  console.warn(
    `[@contentful/experiences] resolveToken returned undefined for token id(s) on "${label}": ${unresolved.join(', ')}. Resolved design (getDesignValues()) will omit those keys.`
  );
  log.log(`unresolved token id(s) on "${label}": ${unresolved.join(', ')}`);
}

/**
 * Depth-first walk that pre-resolves design for a node and all of its slot
 * children, writing the resolved flat `props.design` map on each (from
 * `props.designRaw`).
 */
function preResolveNodeTree(
  node: PortableRenderNode,
  viewports: ViewportDef[],
  fallbackViewportIndex: number,
  resolveToken: ResolveToken | undefined,
  log: DebugLogger
): void {
  const { props, unresolved } = preResolveDesignProperties(
    node.props.designRaw,
    viewports,
    fallbackViewportIndex,
    resolveToken
  );
  node.props.design = props;
  warnUnresolvedTokens(node.registration.componentTypeId, unresolved, log);
  for (const children of Object.values(node.slots)) {
    for (const child of children) {
      preResolveNodeTree(child, viewports, fallbackViewportIndex, resolveToken, log);
    }
  }
}

/**
 * Turns an Experience payload (XDA response shape) into a PortableRenderPlan
 * ready to hand to a renderer. Walks the tree, classifies props, captures
 * slots, and runs any component-declared `resolveData` hooks (sync or async)
 * in parallel.
 *
 * Implementation note: the function is always async — even when no component
 * declares a resolver, the cost is one microtask. Customers get a single
 * uniform call site.
 */
export async function resolveExperience(
  payload: ExperiencePayload,
  config: ResolverConfig,
  options: ResolveExperienceOptions = {}
): Promise<PortableRenderPlan> {
  const log = createDebugLogger(options.debug, 'core');
  log.lazy('resolveExperience called with payload', () => payload);

  // Pass 1: walk the payload into the IR. Collect refs to nodes that need
  // resolveData so pass 2 can run them in parallel without re-walking.
  const nodeRefs: PortableRenderNode[] = [];
  const nodes: PortableRenderNode[] = [];
  for (const node of payload.nodes) {
    const built = buildNode(node, config, nodeRefs);
    if (built !== null) nodes.push(built);
  }
  log.log(`built ${nodes.length} top-level node(s); ${nodeRefs.length} declare resolveData`);

  // Build the page-level template stub if the payload carries one. XDA
  // payloads don't yet emit template-level content/design properties, so
  // the IR carries empty bags.
  const templateUrn = payload.sys?.template?.sys.urn;
  let template: PortableTemplate | undefined;
  if (typeof templateUrn === 'string' && templateUrn.length > 0) {
    template = {
      templateId: extractIdFromUrn(templateUrn),
      props: { content: {}, design: {}, designRaw: {} },
    };
  }

  // Pass 2: run resolveData hooks for components AND the template in parallel.
  // `viewports` is always sourced from the payload — the viewport list is fact,
  // not opinion, so it can't be overridden by the caller.
  const experience: ExperienceContext = {
    debug: options.debug ?? DEFAULT_EXPERIENCE.debug,
    metadata: {
      ...DEFAULT_EXPERIENCE.metadata,
      ...(options.metadata ?? {}),
    },
    viewports: payload.viewports,
  };

  const tasks: Array<Promise<void>> = [];

  for (const node of nodeRefs) {
    const resolver = getResolver(config.components[node.registration.componentTypeId]);
    if (!resolver) continue;
    const ctx: ResolveContext = {
      content: node.props.content,
      design: node.props.designRaw,
      experience,
    };
    tasks.push(
      Promise.resolve(resolver(ctx)).then((resolved) => {
        node.props.resolved = resolved;
      })
    );
  }

  if (template) {
    const tplResolver = getResolver(config.templates?.[template.templateId]);
    if (tplResolver) {
      const ctx: ResolveContext = {
        content: template.props.content,
        design: template.props.designRaw,
        experience,
      };
      const tpl = template;
      tasks.push(
        Promise.resolve(tplResolver(ctx)).then((resolved) => {
          tpl.props.resolved = resolved;
        })
      );
    }
  }

  // Time the fan-out as a whole rather than per-resolver — one aggregate line
  // keeps the timing signal without a line per node (which gets noisy fast).
  if (tasks.length > 0) {
    await log.time(`${tasks.length} resolveData hook(s)`, () => Promise.all(tasks));
  }

  // Server-side design pre-resolution. Always runs: raw design properties are
  // cascaded against a fallback viewport and written to `props.design`
  // (token-resolved via `config.resolveToken`), so SSR emits correct design
  // values on first paint. The fallback viewport is the per-request
  // `initialViewportId` override, else the static `config.fallbackViewportId`
  // default; when neither is set (or the id is unknown) `getViewportIndex` falls
  // back to viewport[0], the first viewport in the list. The raw per-viewport
  // form stays on `props.designRaw`; the client re-resolves on viewport change.
  const fallbackViewportId = options.initialViewportId ?? config.fallbackViewportId;
  const fallbackViewportIndex = getViewportIndex(payload.viewports, fallbackViewportId);
  for (const node of nodes) {
    preResolveNodeTree(node, payload.viewports, fallbackViewportIndex, config.resolveToken, log);
  }
  if (template) {
    const { props, unresolved } = preResolveDesignProperties(
      template.props.designRaw,
      payload.viewports,
      fallbackViewportIndex,
      config.resolveToken
    );
    template.props.design = props;
    warnUnresolvedTokens(`template:${template.templateId}`, unresolved, log);
  }
  log.log(`pre-resolved design against fallback viewport index ${fallbackViewportIndex}`);

  return {
    viewports: payload.viewports,
    nodes,
    ...(template ? { template } : {}),
    fallbackViewportIndex,
  };
}
