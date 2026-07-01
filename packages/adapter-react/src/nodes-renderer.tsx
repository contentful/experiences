/*
 * Recursive renderer over PortableRenderNodes. Pre-renders slot subtrees
 * into ReactNodes during recursion — customer components receive already-
 * rendered ReactNodes by slot name (typically `children`).
 *
 * Customer components are plain React: they receive only the merged prop bag
 * (defaults + content + viewport-resolved design + resolveData output + slots).
 * The Experience runtime context and the raw Contentful payload are exposed
 * via context (see `./context`) rather than spread as props — keeping
 * customer components portable.
 *
 * Server vs client variants share this component; they differ only in how
 * the active viewport is sourced (initial seed vs reactive matchMedia).
 */

import { Fragment, createElement, type ReactNode } from 'react';

import type { PortableRenderNode, PortableTemplate } from '@contentful/experiences-core';
import { resolveDesignProperties } from '@contentful/experiences-design';

import {
  ContentfulComponentProvider,
  ContentfulTemplateProvider,
} from './context';
import type { MissingComponentProps } from './missing-component';
import {
  normalizeComponentRegistration,
  normalizeTemplateRegistration,
  type ContentfulComponent,
  type ContentfulTemplate,
  type Config,
  type RenderContext,
} from './types';

export type RenderUnknown = (props: MissingComponentProps) => ReactNode;

export interface NodesRendererProps {
  nodes: PortableRenderNode[];
  config: Config;
  experience: RenderContext;
  renderUnknown: RenderUnknown;
}

export function NodesRenderer({
  nodes,
  config,
  experience,
  renderUnknown,
}: NodesRendererProps): ReactNode {
  if (!nodes.length) return null;
  return (
    <Fragment>
      {nodes.map((node, index) => (
        <NodeRenderer
          key={node.nodeId ?? index}
          node={node}
          config={config}
          experience={experience}
          renderUnknown={renderUnknown}
        />
      ))}
    </Fragment>
  );
}

interface NodeRendererProps {
  node: PortableRenderNode;
  config: Config;
  experience: RenderContext;
  renderUnknown: RenderUnknown;
}

function NodeRenderer({ node, config, experience, renderUnknown }: NodeRendererProps): ReactNode {
  const { componentTypeId } = node.registration;
  const entry = config.components[componentTypeId];
  if (!entry) {
    return renderUnknown({ componentTypeId, nodeId: node.nodeId });
  }
  const componentConfig = normalizeComponentRegistration(entry);

  // Pre-render slot subtrees so the parent's component receives ReactNodes,
  // not callables. Each named slot becomes a prop with the same name.
  const slotProps: Record<string, ReactNode> = {};
  for (const [slotName, children] of Object.entries(node.slots)) {
    slotProps[slotName] = (
      <NodesRenderer
        nodes={children}
        config={config}
        experience={experience}
        renderUnknown={renderUnknown}
      />
    );
  }

  // Resolve viewport-keyed design values into plain scalars at render time
  // (so client viewport changes don't invalidate the resolveData step).
  const resolvedDesign = resolveDesignProperties(
    node.props.design,
    experience.viewports,
    experience.activeViewportIndex
  );

  const contentful: ContentfulComponent = {
    componentTypeId,
    nodeId: node.nodeId,
    content: node.props.content,
    design: node.props.design,
    resolved: node.props.resolved,
  };

  // Merge precedence (last wins): defaults < content < design <
  // resolveData output < slots. No SDK-shaped extras spread into the bag —
  // those are reachable via useExperience() / useContentfulComponent().
  const composed = {
    ...componentConfig.defaults,
    ...node.props.content,
    ...resolvedDesign,
    ...node.props.resolved,
    ...slotProps,
  };

  return (
    <ContentfulComponentProvider value={contentful}>
      {createElement(componentConfig.component, composed)}
    </ContentfulComponentProvider>
  );
}

export interface WrapWithTemplateProps {
  template: PortableTemplate | undefined;
  config: Config;
  experience: RenderContext;
  children: ReactNode;
}

/**
 * Wraps the rendered Experience nodes with the page-level template when the
 * plan carries one and the customer registered a template config under that
 * id. When the template is referenced but unregistered, warns once and
 * renders children unwrapped — graceful degradation matches the
 * unknown-component fallback story.
 */
export function WrapWithTemplate({
  template,
  config,
  experience,
  children,
}: WrapWithTemplateProps): ReactNode {
  if (!template) return <Fragment>{children}</Fragment>;
  const entry = config.templates?.[template.templateId];
  if (!entry) {
    if (typeof console !== 'undefined') {
      console.warn(
        `[@contentful/experiences-react] No template registered for id "${template.templateId}". Rendering nodes without the template wrapper.`
      );
    }
    return <Fragment>{children}</Fragment>;
  }
  const templateConfig = normalizeTemplateRegistration(entry);

  const resolvedDesign = resolveDesignProperties(
    template.props.design,
    experience.viewports,
    experience.activeViewportIndex
  );

  const contentful: ContentfulTemplate = {
    templateId: template.templateId,
    content: template.props.content,
    design: template.props.design,
    resolved: template.props.resolved,
  };

  const composed = {
    ...templateConfig.defaults,
    ...template.props.content,
    ...resolvedDesign,
    ...template.props.resolved,
    children,
  };

  return (
    <ContentfulTemplateProvider value={contentful}>
      {createElement(templateConfig.component, composed)}
    </ContentfulTemplateProvider>
  );
}
