/*
 * Single async entry that turns an XDA Experience payload into a
 * runtime-neutral PortableRenderPlan ready to render.
 *
 * v1 behavior:
 *  - Walk the payload's nodes recursively. Each ComponentType node becomes
 *    a PortableRenderNode with `registration.componentTypeId` extracted
 *    from `componentType.sys.urn` (last slash-segment).
 *  - Split content + design properties onto `node.props.{content,design}`.
 *    Design-prop envelopes (DesignToken / ManualDesignValue / ValuesByViewport)
 *    are preserved on the IR; the design package unwraps them at render time.
 *  - Template-variant nodes are skipped with a console.warn — out of v1 scope.
 *  - For every component whose registration declares `resolveData`, run the
 *    resolver (sync or async) in parallel with peers, and attach the result
 *    to `node.props.resolved`.
 *  - Unknown component-type-id is a render-time concern (handled by the
 *    framework adapter via `renderUnknown`); the IR still emits the node.
 */

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
} from './types';

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
   * Per-render runtime context exposed to every resolver as `ctx.experience`.
   * Defaults to `{ isPreview: false, metadata: {} }`.
   */
  experience?: Partial<ExperienceContext>;
}

const DEFAULT_EXPERIENCE: ExperienceContext = {
  isPreview: false,
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
        '[@contentful/experiences-core] Skipping Template-variant node — Templates are not supported in v1.'
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
      design: { ...(node.designProperties ?? {}) } as Record<string, DesignPropValue>,
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
  // Pass 1: walk the payload into the IR. Collect refs to nodes that need
  // resolveData so pass 2 can run them in parallel without re-walking.
  const nodeRefs: PortableRenderNode[] = [];
  const nodes: PortableRenderNode[] = [];
  for (const node of payload.nodes) {
    const built = buildNode(node, config, nodeRefs);
    if (built !== null) nodes.push(built);
  }

  // Build the page-level template stub if the payload carries one. XDA
  // payloads don't yet emit template-level content/design properties, so
  // the IR carries empty bags.
  const templateUrn = payload.sys?.template?.sys.urn;
  let template: PortableTemplate | undefined;
  if (typeof templateUrn === 'string' && templateUrn.length > 0) {
    template = {
      templateId: extractIdFromUrn(templateUrn),
      props: { content: {}, design: {} },
    };
  }

  // Pass 2: run resolveData hooks for components AND the template in parallel.
  // `viewports` is always sourced from the payload — caller-supplied
  // options.experience.viewports is ignored (the list is fact, not opinion).
  const experience: ExperienceContext = {
    ...DEFAULT_EXPERIENCE,
    ...options.experience,
    metadata: {
      ...DEFAULT_EXPERIENCE.metadata,
      ...(options.experience?.metadata ?? {}),
    },
    viewports: payload.viewports,
  };

  const tasks: Array<Promise<void>> = [];

  for (const node of nodeRefs) {
    const resolver = getResolver(config.components[node.registration.componentTypeId]);
    if (!resolver) continue;
    const ctx: ResolveContext = {
      content: node.props.content,
      design: node.props.design,
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
        design: template.props.design,
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

  if (tasks.length > 0) await Promise.all(tasks);

  return {
    viewports: payload.viewports,
    nodes,
    ...(template ? { template } : {}),
  };
}
