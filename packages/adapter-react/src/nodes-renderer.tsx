/*
 * Recursive renderer over PortableRenderNodes. Customer components receive the
 * merged props (defaults + design + content + resolveData + slots): resolved
 * design values auto-fill matching props (below content/resolveData so explicit
 * values win) and are also available via `useDesignValues()`.
 */

import { Fragment, createElement, type ReactNode } from 'react';

import type {
  DesignPropValue,
  PortableRenderNode,
  PortableTemplate,
  ViewportDef,
} from '@contentful/experiences-sdk-core';
import { applyTokenResolver, resolveDesignProperties } from '@contentful/experiences-design';

import {
  ContentfulComponentProvider,
  ContentfulTemplateProvider,
  ResolvedDesignProvider,
} from './context';
import type { MissingComponentProps } from './missing-component';
import {
  normalizeComponentRegistration,
  normalizeTemplateRegistration,
  type ContentfulComponent,
  type ContentfulTemplate,
  type Config,
} from './types';

export type RenderUnknown = (props: MissingComponentProps) => ReactNode;

/**
 * Choose the resolved design values for a node. When the server pre-resolved
 * design (`designResolved` present) and the active viewport matches the
 * fallback the server used, the precomputed values are correct as-is — use them
 * and skip the cascade. Otherwise (no pre-resolution, or the client has moved
 * to a different viewport) recompute from the raw design properties.
 */
function selectResolvedDesign(
  props: { design: Record<string, DesignPropValue>; designResolved?: Record<string, unknown> },
  viewports: ViewportDef[],
  activeViewportIndex: number,
  fallbackViewportIndex: number | undefined,
  resolveToken: Config['resolveToken']
): { props: Record<string, unknown>; unresolved: string[] } {
  if (props.designResolved !== undefined && activeViewportIndex === fallbackViewportIndex) {
    return { props: props.designResolved, unresolved: [] };
  }
  const resolvedDesign = resolveDesignProperties(props.design, viewports, activeViewportIndex);
  return applyTokenResolver(resolvedDesign, resolveToken);
}

// Internal renderers take `viewports` + `activeViewportIndex`, not the whole
// RenderContext object — the context is published once via ExperienceProvider,
// and re-threading it as an element prop makes React's RSC serializer back-patch
// a shared reference into frozen props ("Cannot assign to read only property").
export interface NodesRendererProps {
  nodes: PortableRenderNode[];
  config: Config;
  viewports: ViewportDef[];
  activeViewportIndex: number;
  /** Viewport index the server pre-resolved design against, if any. */
  fallbackViewportIndex?: number;
  renderUnknown: RenderUnknown;
}

export function NodesRenderer({
  nodes,
  config,
  viewports,
  activeViewportIndex,
  fallbackViewportIndex,
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
          viewports={viewports}
          activeViewportIndex={activeViewportIndex}
          fallbackViewportIndex={fallbackViewportIndex}
          renderUnknown={renderUnknown}
        />
      ))}
    </Fragment>
  );
}

interface NodeRendererProps {
  node: PortableRenderNode;
  config: Config;
  viewports: ViewportDef[];
  activeViewportIndex: number;
  fallbackViewportIndex?: number;
  renderUnknown: RenderUnknown;
}

function NodeRenderer({
  node,
  config,
  viewports,
  activeViewportIndex,
  fallbackViewportIndex,
  renderUnknown,
}: NodeRendererProps): ReactNode {
  const { componentTypeId } = node.registration;
  const entry = config.components[componentTypeId];
  if (!entry) {
    return createElement(renderUnknown, { componentTypeId, nodeId: node.nodeId });
  }
  const componentConfig = normalizeComponentRegistration(entry);

  // Pre-render slot subtrees so components receive ReactNodes by slot name.
  const slotProps: Record<string, ReactNode> = {};
  for (const [slotName, children] of Object.entries(node.slots)) {
    slotProps[slotName] = (
      <NodesRenderer
        nodes={children}
        config={config}
        viewports={viewports}
        activeViewportIndex={activeViewportIndex}
        fallbackViewportIndex={fallbackViewportIndex}
        renderUnknown={renderUnknown}
      />
    );
  }

  // Prefer the server pre-resolved design values when the active viewport
  // matches the fallback; otherwise cascade + resolve design tokens here.
  // Auto-filled into props below and published on context for useDesignValues().
  const { props: tokenResolvedDesign, unresolved } = selectResolvedDesign(
    node.props,
    viewports,
    activeViewportIndex,
    fallbackViewportIndex,
    config.resolveToken
  );
  if (unresolved.length && typeof console !== 'undefined') {
    console.warn(
      `[@contentful/experiences-react] resolveToken returned undefined for token id(s) on "${componentTypeId}": ${unresolved.join(', ')}. useDesignValues() will omit those keys.`
    );
  }

  const contentful: ContentfulComponent = {
    componentTypeId,
    nodeId: node.nodeId,
    content: node.props.content,
    design: node.props.design,
    resolved: node.props.resolved,
  };

  // Merge precedence (last wins): defaults < design < content < resolveData
  // < slots. Resolved design values auto-fill matching props (by their raw
  // design key, e.g. `cfColor`), but sit below content/resolveData so explicit
  // values always override design. The same values remain available via
  // useDesignValues() for components that read design explicitly.
  const composed = {
    ...componentConfig.defaults,
    ...tokenResolvedDesign,
    ...node.props.content,
    ...node.props.resolved,
    ...slotProps,
  };

  return (
    <ContentfulComponentProvider value={contentful}>
      <ResolvedDesignProvider value={tokenResolvedDesign}>
        {createElement(componentConfig.component, composed)}
      </ResolvedDesignProvider>
    </ContentfulComponentProvider>
  );
}

export interface WrapWithTemplateProps {
  template: PortableTemplate | undefined;
  config: Config;
  viewports: ViewportDef[];
  activeViewportIndex: number;
  /** Viewport index the server pre-resolved design against, if any. */
  fallbackViewportIndex?: number;
  children: ReactNode;
}

/**
 * Wraps the rendered nodes with the page-level template. If the template is
 * referenced but unregistered, warns once and renders children unwrapped.
 */
export function WrapWithTemplate({
  template,
  config,
  viewports,
  activeViewportIndex,
  fallbackViewportIndex,
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

  const { props: tokenResolvedDesign, unresolved } = selectResolvedDesign(
    template.props,
    viewports,
    activeViewportIndex,
    fallbackViewportIndex,
    config.resolveToken
  );
  if (unresolved.length && typeof console !== 'undefined') {
    console.warn(
      `[@contentful/experiences-react] resolveToken returned undefined for token id(s) on template "${template.templateId}": ${unresolved.join(', ')}. useDesignValues() will omit those keys.`
    );
  }

  const contentful: ContentfulTemplate = {
    templateId: template.templateId,
    content: template.props.content,
    design: template.props.design,
    resolved: template.props.resolved,
  };

  // Same precedence as component nodes: defaults < design < content <
  // resolveData < children.
  const composed = {
    ...templateConfig.defaults,
    ...tokenResolvedDesign,
    ...template.props.content,
    ...template.props.resolved,
    children,
  };

  return (
    <ContentfulTemplateProvider value={contentful}>
      <ResolvedDesignProvider value={tokenResolvedDesign}>
        {createElement(templateConfig.component, composed)}
      </ResolvedDesignProvider>
    </ContentfulTemplateProvider>
  );
}
