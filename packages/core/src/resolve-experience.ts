/*
 * Turns an XDA Experience payload into a runtime-neutral PortableRenderPlan.
 * Walks nodes recursively, splits content + design props, runs any registered
 * `resolveData` hooks in parallel, and pre-resolves design against a fallback
 * viewport (see `resolveExperience` below).
 */

import { createDebugLogger, type DebugLogger } from './debug-logger';
import type {
  DesignPropValue,
  ExperienceContext,
  ExperienceNode,
  ExperiencePayload,
  PortableRegistration,
  PortableRenderNode,
  PortableRenderPlan,
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
  experienceTemplates?: Record<string, unknown>;
  /**
   * Resolves `DesignToken` design properties to runtime values. Mirrors the
   * adapter `Config.resolveToken`, so server and client agree without the
   * caller re-supplying it. Used during server-side pre-resolution.
   */
  resolveToken?: ResolveToken;
  /**
   * Default fallback viewport for server-side design pre-resolution. When unset
   * (and not overridden by `initialViewportId`), defaults to viewport[0].
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
   * `ctx.experience.metadata`. Defaults to `{}`.
   */
  metadata?: Record<string, unknown>;
  /**
   * Observability switch. When on, `resolveExperience` logs the resolution
   * steps and per-node `resolveData` fan-out timings. Threads through to the
   * resolver context as `ctx.experience.debug`. Defaults to `false`.
   */
  debug?: boolean;
  /**
   * Per-request override for the design pre-resolution fallback viewport. Wins
   * over `config.fallbackViewportId` — pass a request-time value (e.g. a
   * User-Agent-detected viewport) so SSR targets the device's expected
   * viewport. Defaults to viewport[0] when unset or unknown.
   */
  initialViewportId?: string;
}

const DEFAULT_EXPERIENCE: ExperienceContext = {
  debug: false,
  metadata: {},
  viewports: [],
};

/**
 * Registry lookup for a built node. A node's `kind` decides which half of the
 * customer Config owns its implementation — components and Experience
 * Templates are otherwise interchangeable at every other step.
 */
function lookupEntry(config: ResolverConfig, registration: PortableRegistration): unknown {
  return registration.kind === 'experienceTemplate'
    ? config.experienceTemplates?.[registration.id]
    : config.components[registration.id];
}

/**
 * Extract the flat id (component or experienceTemplate) from its
 * `ResourceLink` URN. Real URN shapes:
 *   crn:contentful:::experience:spaces/$self/environments/$self/components/<id>
 *   crn:contentful:::experience:spaces/$self/environments/$self/experienceTemplates/<id>
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
 * Read the ResourceLink a node points at. Which key is present is the only
 * difference between the two node variants: `experienceTemplate` means the
 * implementation lives in the customer's `experienceTemplates` registry,
 * `component` in `components`. Both carry ids in the same URN shape, the same
 * prop bags, and the same slots — so everything downstream is kind-agnostic.
 *
 * `ExperienceNode` is a closed union, so a typed caller cannot produce anything
 * else. Payloads, however, are untrusted JSON at runtime, and the realistic way
 * a third shape arrives is a node kind *newer than this SDK*. Returns `null`
 * for anything unidentifiable rather than letting the ref access throw — see
 * `buildNode`.
 */
function readNodeRef(
  node: ExperienceNode
): { kind: PortableRegistration['kind']; urn: string } | null {
  const isExperienceTemplate = 'experienceTemplate' in node;
  const ref = isExperienceTemplate
    ? node.experienceTemplate
    : 'component' in node
      ? node.component
      : undefined;
  // Cast because the runtime value may violate the declared type: a node can
  // carry `component: {}`, which satisfies `'component' in node` but has no urn.
  const urn = (ref as { sys?: { urn?: unknown } } | undefined)?.sys?.urn;
  if (typeof urn !== 'string' || urn.length === 0) return null;
  return { kind: isExperienceTemplate ? 'experienceTemplate' : 'component', urn };
}

/** Total node count in a payload subtree, the node itself included. */
function countPayloadNodes(node: ExperienceNode): number {
  const slots = (node as { slots?: Record<string, unknown> }).slots;
  let total = 1;
  if (slots && typeof slots === 'object') {
    for (const children of Object.values(slots)) {
      if (!Array.isArray(children)) continue;
      for (const child of children) total += countPayloadNodes(child as ExperienceNode);
    }
  }
  return total;
}

/**
 * The one case where a node is dropped. AIS-413 was the opposite failure —
 * a node kind the SDK recognized and could have rendered, skipped behind a
 * vague warning, taking its whole subtree with it — so the bar here is that
 * nothing vanishes without a diagnostic naming what was lost.
 *
 * Dropping beats throwing: a `resolveExperience` rejection fails the entire
 * experience, so one unrecognized node in a sidebar would take down every page
 * containing it, for a payload the customer does not control and cannot fix.
 */
function warnUnrenderableNode(node: ExperienceNode, log: DebugLogger): void {
  const id = (node as { id?: unknown }).id;
  const label = typeof id === 'string' ? ` "${id}"` : '';
  const keys = Object.keys(node);
  const descendants = countPayloadNodes(node) - 1;
  const message =
    `Skipping unidentifiable node${label}: expected a \`component\` or \`experienceTemplate\` ` +
    `ResourceLink carrying a urn, got keys [${keys.join(', ')}]. Dropping it and ${descendants} ` +
    `descendant node(s). A payload node kind this SDK does not know is usually a version skew — ` +
    `upgrading @contentful/experiences-sdk-core may be all that is needed.`;
  if (typeof console !== 'undefined') {
    console.warn(`[@contentful/experiences] ${message}`);
  }
  log.log(message);
}

/**
 * Walk a sibling list into IR nodes, dropping any node `buildNode` cannot
 * identify. Used for both the top-level list and every slot.
 */
function buildNodes(
  nodes: ExperienceNode[],
  config: ResolverConfig,
  nodeRefs: PortableRenderNode[],
  log: DebugLogger
): PortableRenderNode[] {
  const built: PortableRenderNode[] = [];
  for (const node of nodes) {
    const one = buildNode(node, config, nodeRefs, log);
    if (one !== null) built.push(one);
  }
  return built;
}

/**
 * Recursively turn a payload node into an IR node. The collected `nodeRefs`
 * array is for the resolver pass — every built node with a registered
 * resolver gets a reference appended so we can run them in parallel without
 * walking the tree twice.
 *
 * Returns `null` only for a node whose ResourceLink cannot be read, which
 * `warnUnrenderableNode` has already reported. Callers go through `buildNodes`.
 */
function buildNode(
  node: ExperienceNode,
  config: ResolverConfig,
  nodeRefs: PortableRenderNode[],
  log: DebugLogger
): PortableRenderNode | null {
  const ref = readNodeRef(node);
  if (ref === null) {
    warnUnrenderableNode(node, log);
    return null;
  }
  const registration: PortableRegistration = {
    kind: ref.kind,
    id: extractIdFromUrn(ref.urn),
  };

  const slots: Record<string, PortableRenderNode[]> = {};
  if (node.slots) {
    for (const [slotName, children] of Object.entries(node.slots)) {
      if (!Array.isArray(children)) {
        throw new TypeError(
          `Slot "${slotName}" on ${registration.kind} "${registration.id}" must be an array of nodes.`
        );
      }
      slots[slotName] = buildNodes(children, config, nodeRefs, log);
    }
  }

  const built: PortableRenderNode = {
    registration,
    props: {
      content: { ...(node.contentProperties ?? {}) },
      // Resolved flat values are written by the pre-resolution pass below.
      design: {},
      designRaw: { ...(node.designProperties ?? {}) } as Record<string, DesignPropValue>,
    },
    slots,
  };
  if (node.id) built.nodeId = node.id;
  if (getResolver(lookupEntry(config, registration))) {
    nodeRefs.push(built);
  }
  return built;
}

// Cascade a node's raw design to the fallback viewport and resolve tokens.
// Returns the flat resolved map plus any token ids left unresolved (dropped).
function preResolveDesignProperties(
  design: Record<string, DesignPropValue>,
  viewports: ViewportDef[],
  fallbackViewportIndex: number,
  resolveToken: ResolveToken | undefined
): { props: Record<string, unknown>; unresolved: string[] } {
  const cascaded = resolveDesignProperties(design, viewports, fallbackViewportIndex);
  return applyTokenResolver(cascaded, resolveToken);
}

// Warn when resolveToken left tokens unresolved, so dropped keys are diagnosable.
function warnUnresolvedTokens(label: string, unresolved: string[], log: DebugLogger): void {
  if (!unresolved.length || typeof console === 'undefined') return;
  console.warn(
    `[@contentful/experiences] resolveToken returned undefined for token id(s) on "${label}": ${unresolved.join(', ')}. Resolved design (getDesignValues()) will omit those keys.`
  );
  log.log(`unresolved token id(s) on "${label}": ${unresolved.join(', ')}`);
}

// Depth-first pre-resolve for a node and its slot children.
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
  warnUnresolvedTokens(`${node.registration.kind}:${node.registration.id}`, unresolved, log);
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
  const nodes: PortableRenderNode[] = buildNodes(payload.nodes, config, nodeRefs, log);
  log.log(`built ${nodes.length} top-level node(s); ${nodeRefs.length} declare resolveData`);

  // Pass 2: run every node's resolveData hook in parallel.
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
    const resolver = getResolver(lookupEntry(config, node.registration));
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

  // Time the fan-out as a whole rather than per-resolver — one aggregate line
  // keeps the timing signal without a line per node (which gets noisy fast).
  if (tasks.length > 0) {
    await log.time(`${tasks.length} resolveData hook(s)`, () => Promise.all(tasks));
  }

  // Pre-resolve design against the fallback viewport so SSR paints correct
  // values on first render. Fallback is initialViewportId, else
  // config.fallbackViewportId, else viewport[0].
  const fallbackViewportId = options.initialViewportId ?? config.fallbackViewportId;
  const fallbackViewportIndex = getViewportIndex(payload.viewports, fallbackViewportId);
  for (const node of nodes) {
    preResolveNodeTree(node, payload.viewports, fallbackViewportIndex, config.resolveToken, log);
  }
  log.log(`pre-resolved design against fallback viewport index ${fallbackViewportIndex}`);

  return {
    viewports: payload.viewports,
    nodes,
    fallbackViewportIndex,
  };
}
