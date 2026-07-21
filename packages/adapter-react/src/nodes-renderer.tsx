/*
 * Recursive renderer over PortableRenderNodes. Customer components receive the
 * merged prop bag (defaults + content + resolveData + slots); design values
 * are read via `useDesignValues()`, not injected as props.
 */

import { Fragment, createElement, type ReactNode } from 'react';

import type {
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

// Internal renderers take `viewports` + `activeViewportIndex`, not the whole
// RenderContext object — the context is published once via ExperienceProvider,
// and re-threading it as an element prop makes React's RSC serializer back-patch
// a shared reference into frozen props ("Cannot assign to read only property").
export interface NodesRendererProps {
  nodes: PortableRenderNode[];
  config: Config;
  viewports: ViewportDef[];
  activeViewportIndex: number;
  renderUnknown: RenderUnknown;
}

export function NodesRenderer({
  nodes,
  config,
  viewports,
  activeViewportIndex,
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
  renderUnknown: RenderUnknown;
}

function NodeRenderer({
  node,
  config,
  viewports,
  activeViewportIndex,
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
        renderUnknown={renderUnknown}
      />
    );
  }

  // Cascade design to the active viewport, then resolve DesignToken envelopes.
  // Published on context for useDesignValues() — never spread onto props.
  const resolvedDesign = resolveDesignProperties(node.props.design, viewports, activeViewportIndex);
  const { props: tokenResolvedDesign, unresolved } = applyTokenResolver(
    resolvedDesign,
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

  // Merge precedence (last wins): defaults < content < resolveData < slots.
  const composed = {
    ...componentConfig.defaults,
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
    viewports,
    activeViewportIndex
  );

  const { props: tokenResolvedDesign, unresolved } = applyTokenResolver(
    resolvedDesign,
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

  const composed = {
    ...templateConfig.defaults,
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
