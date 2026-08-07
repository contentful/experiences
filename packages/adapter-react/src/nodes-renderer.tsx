/*
 * Recursive renderer over PortableRenderNodes. Customer components receive the
 * merged prop bag (defaults + content + resolveData + slots); design values
 * are read via `useDesignValues()`, not injected as props.
 */

import { Fragment, createElement, type ReactNode } from 'react';

import type {
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
      `[@contentful/experiences-react] resolveToken returned undefined for token id(s) on "${componentId}": ${unresolved.join(', ')}. useDesignValues() will omit those keys.`
    );
  }

  const contentful: ContentfulComponent = {
    componentId,
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

export interface WrapWithExperienceTemplateProps {
  experienceTemplate: PortableExperienceTemplate | undefined;
  config: Config;
  viewports: ViewportDef[];
  activeViewportIndex: number;
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

  const resolvedDesign = resolveDesignProperties(
    experienceTemplate.props.design,
    viewports,
    activeViewportIndex
  );

  const { props: tokenResolvedDesign, unresolved } = applyTokenResolver(
    resolvedDesign,
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
    design: experienceTemplate.props.design,
    resolved: experienceTemplate.props.resolved,
  };

  const composed = {
    ...experienceTemplateConfig.defaults,
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
