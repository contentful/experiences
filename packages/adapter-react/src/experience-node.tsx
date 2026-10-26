/*
 * Renders one node the way the SDK renderers do (they render through this too):
 * context providers, error boundary, then the component with props and slots.
 * Directive-free so a Server Component can pass it a resolved node.
 */

import { createElement, type ReactNode } from 'react';

import { ComponentError } from './component-error.js';
// A class component, so it lives in its own `'use client'` file.
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

/** Props of `ExperienceNode` and of the component `createExperienceNode` returns. */
export interface BoundExperienceNodeProps {
  node: ResolvedComponentNode | ResolvedExperienceTemplateNode | NodeSnapshot;
  /** Publishes `useExperience()`. Needed outside an SDK renderer; context doesn't cross serialization boundaries. */
  experience?: RenderContext;
  /** Fallback rendered when the component throws. Defaults to `ComponentError`. */
  renderError?: RenderError;
  /** Slot props by name. Extra props are treated as slots too; `slots` wins on a clash. */
  slots?: Record<string, unknown>;
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
  ...slotProps
}: ExperienceNodeProps): ReactNode {
  const component =
    'component' in node ? node.component : lookupComponent(node, components, experienceTemplates);

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

function lookupComponent(
  node: NodeSnapshot,
  components: Components | undefined,
  experienceTemplates: ExperienceTemplates | undefined
) {
  // A missing entry is a wiring mistake, not missing content, so fail loudly.
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
