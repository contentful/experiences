/*
 * Renders one node the way the SDK renderers do (they render through this too):
 * context providers, error boundary, then the component with props and slots.
 * Directive-free so a Server Component can pass it a resolved node.
 */

import { createElement, type ReactNode } from 'react';
import { getNodeTrackingAttributes } from '../tracking/node-tracking-attributes.js';

import { BoundNodeRoots } from '../tracking/bound-node-roots.js';
import { ComponentError } from '../diagnostics/component-error.js';
// A class component, so it lives in its own `'use client'` file.
import { ComponentErrorBoundary } from '../diagnostics/component-error-boundary.js';
import {
  ContentfulComponentProvider,
  ContentfulExperienceTemplateProvider,
  ExperienceProvider,
  ResolvedDesignProvider,
} from '../rendering/context.js';
import type { RenderError } from '../rendering/nodes-renderer.js';
import type {
  ExperienceTrackingOptions,
  OnExperienceNodeRoot,
} from '../tracking/root-binding-types.js';
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
} from '../registry/types.js';

/** Props of `ExperienceNode` and of the component `createExperienceNode` returns. */
export interface BoundExperienceNodeProps extends ExperienceTrackingOptions {
  node: ResolvedComponentNode | ResolvedExperienceTemplateNode | NodeSnapshot;
  /** Publishes `useExperience()`. Needed outside an SDK renderer; context doesn't cross serialization boundaries. */
  experience?: RenderContext;
  /** Fallback rendered when the component throws. Defaults to `ComponentError`. */
  renderError?: RenderError;
  /** Slot props by name. Extra props are treated as slots too; `slots` wins on a clash. */
  slots?: Record<string, unknown>;
  /** Client-owned root registration. Return cleanup for plan replacement or removal. */
  onNodeRoot?: OnExperienceNodeRoot;
  [slot: string]: unknown;
}

export interface ExperienceNodeProps extends BoundExperienceNodeProps {
  /** Where a snapshot `node`'s component is looked up. */
  components?: Components;
  experienceTemplates?: ExperienceTemplates;
}

export function ExperienceNode({
  node,
  components,
  experienceTemplates,
  experience,
  renderError = ComponentError,
  slots,
  clickable,
  trackClicks,
  trackHovers,
  trackViews,
  onNodeRoot,
  ...slotProps
}: ExperienceNodeProps): ReactNode {
  const registration =
    'component' in node
      ? { component: node.component, root: node.root }
      : lookupRegistration(node, components, experienceTemplates);
  const { component } = registration;
  const rootProp = registration.root?.prop ?? node.root?.prop;
  const snapshot = 'snapshot' in node ? node.snapshot : node;
  const props = { ...node.props, ...slotProps, ...slots };
  delete props['data-ctfl-scopes'];
  const content =
    rootProp || onNodeRoot ? (
      <BoundNodeRoots
        component={component}
        props={props}
        node={snapshot}
        rootProp={rootProp}
        clickable={clickable}
        trackClicks={trackClicks}
        trackHovers={trackHovers}
        trackViews={trackViews}
        onNodeRoot={onNodeRoot}
      />
    ) : (
      // Only serializable attributes cross the default Server→Client component boundary.
      createElement(component, {
        ...props,
        ...getNodeTrackingAttributes(node.contentful.attribution, {
          clickable,
          trackClicks,
          trackHovers,
          trackViews,
        }),
      })
    );

  const element = (
    <ResolvedDesignProvider value={node.design}>
      <ComponentErrorBoundary
        fallback={createElement(renderError, { componentId: node.id, nodeId: node.nodeId })}
        componentId={node.id}
        kind={node.kind}
        nodeId={node.nodeId}
      >
        {content}
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
 * `ExperienceNode` with its registries bound, for rendering snapshots where
 * components can't be passed as props. Only the bound components are bundled.
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

function lookupRegistration(
  node: NodeSnapshot,
  components: Components | undefined,
  experienceTemplates: ExperienceTemplates | undefined
) {
  // A missing entry is a wiring mistake, not missing content, so fail loudly.
  if (node.kind === 'experienceTemplate') {
    const entry = experienceTemplates?.[node.id];
    if (!entry) throw new Error(missingMessage(node, 'experienceTemplates'));
    return normalizeExperienceTemplateRegistration(entry);
  }
  const entry = components?.[node.id];
  if (!entry) throw new Error(missingMessage(node, 'components'));
  return normalizeComponentRegistration(entry);
}

function missingMessage(node: NodeSnapshot, registry: string): string {
  return (
    `[@contentful/experiences-react] ExperienceNode received a snapshot of ${node.kind} "${node.id}"` +
    `${node.nodeId ? ` (node "${node.nodeId}")` : ''} but "${node.id}" is not in its ${registry}. ` +
    `Add it to the map passed to createExperienceNode().`
  );
}
