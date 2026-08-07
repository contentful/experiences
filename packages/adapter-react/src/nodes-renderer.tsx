/*
 * Recursive renderer over PortableRenderNodes. Resolved design values auto-fill
 * matching props (below content/resolveData) and are also available via
 * `useDesignValues()`.
 */

import { Fragment, createElement, type ReactNode } from 'react';

import type {
  DesignPropValue,
  PortableExperienceTemplate,
  PortableRenderNode,
  ViewportDef,
} from '@contentful/experiences-sdk-core';
import { applyTokenResolver, resolveDesignProperties } from '@contentful/experiences-design';

import {
  ContentfulComponentProvider,
  ContentfulExperienceTemplateProvider,
  ResolvedDesignProvider,
} from './context';
import type { MissingComponentProps } from './missing-component';
import {
  normalizeComponentRegistration,
  normalizeExperienceTemplateRegistration,
  type ContentfulComponent,
  type ContentfulExperienceTemplate,
  type Config,
} from './types';

export type RenderUnknown = (props: MissingComponentProps) => ReactNode;

// Use the server-resolved `props.design` when the active viewport matches the
// fallback; otherwise recompute the cascade from raw `props.designRaw`.
function selectResolvedDesign(
  props: { design: Record<string, unknown>; designRaw: Record<string, DesignPropValue> },
  viewports: ViewportDef[],
  activeViewportIndex: number,
  fallbackViewportIndex: number | undefined,
  resolveToken: Config['resolveToken']
): { props: Record<string, unknown>; unresolved: string[] } {
  if (activeViewportIndex === fallbackViewportIndex) {
    return { props: props.design, unresolved: [] };
  }
  const resolvedDesign = resolveDesignProperties(props.designRaw, viewports, activeViewportIndex);
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
  const { componentId } = node.registration;
  const entry = config.components[componentId];
  if (!entry) {
    return createElement(renderUnknown, { componentId, nodeId: node.nodeId });
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

  const { props: tokenResolvedDesign, unresolved } = selectResolvedDesign(
    node.props,
    viewports,
    activeViewportIndex,
    fallbackViewportIndex,
    config.resolveToken
  );
  if (unresolved.length && typeof console !== 'undefined') {
    console.warn(
      `[@contentful/experiences-react] resolveToken returned undefined for token id(s) on "${componentId}": ${unresolved.join(', ')}. useDesignValues() will omit those keys.`
    );
  }

  const contentful: ContentfulComponent = {
    componentId,
    nodeId: node.nodeId,
    content: node.props.content,
    design: node.props.designRaw,
    resolved: node.props.resolved,
  };

  // Merge precedence (last wins): defaults < design < content < resolveData < slots.
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

export interface WrapWithExperienceTemplateProps {
  experienceTemplate: PortableExperienceTemplate | undefined;
  config: Config;
  viewports: ViewportDef[];
  activeViewportIndex: number;
  /** Viewport index the server pre-resolved design against, if any. */
  fallbackViewportIndex?: number;
  children: ReactNode;
}

/**
 * Wraps the rendered nodes with the page-level Experience Template. If the
 * template is referenced but unregistered, warns once and renders children
 * unwrapped.
 */
export function WrapWithExperienceTemplate({
  experienceTemplate,
  config,
  viewports,
  activeViewportIndex,
  fallbackViewportIndex,
  children,
}: WrapWithExperienceTemplateProps): ReactNode {
  if (!experienceTemplate) return <Fragment>{children}</Fragment>;
  const entry = config.experienceTemplates?.[experienceTemplate.experienceTemplateId];
  if (!entry) {
    if (typeof console !== 'undefined') {
      console.warn(
        `[@contentful/experiences-react] No experience template registered for id "${experienceTemplate.experienceTemplateId}". Rendering nodes without the experience template wrapper.`
      );
    }
    return <Fragment>{children}</Fragment>;
  }
  const experienceTemplateConfig = normalizeExperienceTemplateRegistration(entry);

  const { props: tokenResolvedDesign, unresolved } = selectResolvedDesign(
    experienceTemplate.props,
    viewports,
    activeViewportIndex,
    fallbackViewportIndex,
    config.resolveToken
  );
  if (unresolved.length && typeof console !== 'undefined') {
    console.warn(
      `[@contentful/experiences-react] resolveToken returned undefined for token id(s) on experience template "${experienceTemplate.experienceTemplateId}": ${unresolved.join(', ')}. useDesignValues() will omit those keys.`
    );
  }

  const contentful: ContentfulExperienceTemplate = {
    experienceTemplateId: experienceTemplate.experienceTemplateId,
    content: experienceTemplate.props.content,
    design: experienceTemplate.props.designRaw,
    resolved: experienceTemplate.props.resolved,
  };

  // Same precedence as component nodes, ending in `children`.
  const composed = {
    ...experienceTemplateConfig.defaults,
    ...tokenResolvedDesign,
    ...experienceTemplate.props.content,
    ...experienceTemplate.props.resolved,
    children,
  };

  return (
    <ContentfulExperienceTemplateProvider value={contentful}>
      <ResolvedDesignProvider value={tokenResolvedDesign}>
        {createElement(experienceTemplateConfig.component, composed)}
      </ResolvedDesignProvider>
    </ContentfulExperienceTemplateProvider>
  );
}
