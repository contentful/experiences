/*
 * One plan node, rendered exactly as `NodeRenderer` renders it: the node's
 * context providers, the per-node error boundary, then the component with
 * merged props + slot props. `NodeRenderer` renders through this too, so a
 * host-rendered node and an SDK-rendered node can't drift.
 *
 * Takes either a resolved node (has `component`; server side, or anywhere
 * component references are available) or a `NodeSnapshot` (plain data; the
 * client side of an Astro island or a `'use client'` boundary), in which case
 * the component is looked up by id in `components` / `experienceTemplates`.
 *
 * Directive-free so a React Server Component can render it and hand it a
 * resolved node, component reference included.
 */

import { createElement, type ReactNode } from 'react';

import { ComponentError } from './component-error.js';
// `ComponentErrorBoundary` lives in its own `'use client'` file — see
// component-error-boundary.tsx for why (it's a class component, which
// Next.js's RSC bundler rejects from a directive-free file).
import { ComponentErrorBoundary } from './component-error-boundary.js';
import {
  ContentfulComponentProvider,
  ContentfulExperienceTemplateProvider,
  ExperienceProvider,
  ResolvedDesignProvider,
} from './context.js';
import type { RenderError } from './nodes-renderer.js';
import type {
  NodeSnapshot,
  ResolvedComponentNode,
  ResolvedExperienceTemplateNode,
} from './resolve-node-props.js';
import {
  normalizeComponentRegistration,
  normalizeExperienceTemplateRegistration,
  type Components,
  type ExperienceTemplates,
  type RenderContext,
} from './types.js';

/** Props shared by `ExperienceNode` and the component `createExperienceNode` returns. */
export interface BoundExperienceNodeProps {
  node: ResolvedComponentNode | ResolvedExperienceTemplateNode | NodeSnapshot;
  /**
   * Publishes `useExperience()` for this node and its descendants. Pass it when
   * the node renders outside an SDK renderer, e.g. as its own island; context
   * doesn't cross island or `'use client'` boundaries.
   */
  experience?: RenderContext;
  /** Fallback rendered when the component throws. Defaults to `ComponentError`. */
  renderError?: RenderError;
  /**
   * Slot props, keyed by slot name. Extra props on `ExperienceNode` are treated
   * as slots too, which is how Astro passes slot content (`children`,
   * `content`, ...). Explicit `slots` win over extra props of the same name.
   */
  slots?: Record<string, unknown>;
  [slot: string]: unknown;
}

export interface ExperienceNodeProps extends BoundExperienceNodeProps {
  /** Registry the component of a snapshot `node` is looked up in. A subset of `config.components` works. */
  components?: Components;
  /** Same as `components`, for an Experience Template snapshot. */
  experienceTemplates?: ExperienceTemplates;
}

export function ExperienceNode({
  node,
  components,
  experienceTemplates,
  experience,
  renderError = ComponentError,
  slots,
  ...slotProps
}: ExperienceNodeProps): ReactNode {
  const component =
    'component' in node ? node.component : lookupComponent(node, components, experienceTemplates);

  // Slot props spread last: defaults < design < content < resolveData < slots.
  const element = (
    <ResolvedDesignProvider value={node.design}>
      <ComponentErrorBoundary
        fallback={createElement(renderError, { componentId: node.id, nodeId: node.nodeId })}
        componentId={node.id}
        kind={node.kind}
        nodeId={node.nodeId}
      >
        {createElement(component, { ...node.props, ...slotProps, ...slots })}
      </ComponentErrorBoundary>
    </ResolvedDesignProvider>
  );

  const scoped =
    node.kind === 'experienceTemplate' ? (
      <ContentfulExperienceTemplateProvider value={node.contentful}>
        {element}
      </ContentfulExperienceTemplateProvider>
    ) : (
      <ContentfulComponentProvider value={node.contentful}>{element}</ContentfulComponentProvider>
    );

  return experience ? <ExperienceProvider value={experience}>{scoped}</ExperienceProvider> : scoped;
}

/**
 * `ExperienceNode` with its registries bound, for the receiving side of a
 * serialization boundary. Island props are serialized, so the component map
 * can't be one of them; binding it in a module the island imports is how the
 * component reaches the client. Only the components listed here ship to the
 * browser, so list the ones that hydrate, not the whole `config.components`.
 *
 *   export const IslandExperienceNode = createExperienceNode({ card: Card });
 *   <IslandExperienceNode client:visible node={resolved.snapshot} experience={experience} />
 */
export function createExperienceNode(
  components: Components,
  experienceTemplates?: ExperienceTemplates
): (props: BoundExperienceNodeProps) => ReactNode {
  function BoundExperienceNode(props: BoundExperienceNodeProps): ReactNode {
    return (
      <ExperienceNode
        {...props}
        components={components}
        experienceTemplates={experienceTemplates}
      />
    );
  }
  return BoundExperienceNode;
}

function lookupComponent(
  node: NodeSnapshot,
  components: Components | undefined,
  experienceTemplates: ExperienceTemplates | undefined
) {
  // A missing entry here is a host wiring mistake, not editorial content, so
  // fail loudly rather than render a silent gap like an unregistered plan id.
  if (node.kind === 'experienceTemplate') {
    const entry = experienceTemplates?.[node.id];
    if (!entry) throw new Error(missingMessage(node, 'experienceTemplates'));
    return normalizeExperienceTemplateRegistration(entry).component;
  }
  const entry = components?.[node.id];
  if (!entry) throw new Error(missingMessage(node, 'components'));
  return normalizeComponentRegistration(entry).component;
}

function missingMessage(node: NodeSnapshot, registry: string): string {
  return (
    `[@contentful/experiences-react] ExperienceNode received a snapshot of ${node.kind} "${node.id}"` +
    `${node.nodeId ? ` (node "${node.nodeId}")` : ''} but "${node.id}" is not in its ${registry}. ` +
    `Add it to the map passed to createExperienceNode().`
  );
}
