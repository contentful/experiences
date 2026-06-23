/*
 * Recursive renderer over PortableRenderNodes. Pre-renders slots into React
 * subtrees during recursion — customer components receive already-rendered
 * ReactNodes by slot name.
 *
 * Server vs client variants share this component; they differ only in how
 * the active viewport is sourced (initial seed vs reactive matchMedia).
 */

import { Fragment, type ReactNode } from 'react';

import type { PortableRenderNode, PortableTemplate } from '@contentful/experiences-core';
import { resolveDesignProperties } from '@contentful/experiences-design';

import type { MissingComponentProps } from './missing-component';
import type { Config, RenderContext } from './types';

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
  const componentConfig = config.components[componentTypeId];
  if (!componentConfig) {
    return renderUnknown({
      componentTypeId,
      nodeId: node.nodeId,
      experience,
    });
  }

  // Pre-render slot subtrees so the parent's render fn receives ReactNodes,
  // not callables.
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

  // Merge precedence (last wins): defaults < content < design <
  // resolveData output < slots < experience.
  return componentConfig.render({
    ...componentConfig.defaults,
    ...node.props.content,
    ...resolvedDesign,
    ...node.props.resolved,
    ...slotProps,
    experience,
  });
}

export interface WrapWithTemplateProps {
  template: PortableTemplate | undefined;
  config: Config;
  experience: RenderContext;
  children: ReactNode;
}

/**
 * Wraps the rendered experience nodes with the page-level template when the
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
  const templateConfig = config.templates?.[template.templateId];
  if (!templateConfig) {
    if (typeof console !== 'undefined') {
      console.warn(
        `[@contentful/experiences-react] No template registered for id "${template.templateId}". Rendering nodes without the template wrapper.`
      );
    }
    return <Fragment>{children}</Fragment>;
  }

  const resolvedDesign = resolveDesignProperties(
    template.props.design,
    experience.viewports,
    experience.activeViewportIndex
  );

  // Merge precedence mirrors components: defaults < content < design <
  // resolveData output < children/experience.
  return templateConfig.render({
    ...templateConfig.defaults,
    ...template.props.content,
    ...resolvedDesign,
    ...template.props.resolved,
    children,
    experience,
  });
}
