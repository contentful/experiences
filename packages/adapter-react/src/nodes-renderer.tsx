/*
 * Recursive renderer over PortableRenderNodes. Resolved design values auto-fill
 * matching props (below content/resolveData) and are also available via
 * `useDesignValues()`.
 */

import { Fragment, createElement, type ReactNode } from 'react';

import type {
  DesignPropValue,
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
  fallbackViewportIndex: number,
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
  /** Viewport index the server pre-resolved design against. */
  fallbackViewportIndex: number;
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
  fallbackViewportIndex: number;
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
  const { kind, id } = node.registration;
  const isExperienceTemplate = kind === 'experienceTemplate';

  // Pre-render each slot's children as an *array* of ReactNodes (one keyed
  // element per child), not a single wrapping node. A component can drop the
  // array straight into JSX for the common "just render them" case (React
  // renders keyed arrays), or map/filter/wrap the children individually.
  //
  // Slot name → prop name, for both node kinds: a coded Experience Template
  // declaring a `content` slot receives a `content` prop. `children` is not a
  // special case, just the conventional default slot name.
  const slotProps: Record<string, ReactNode[]> = {};
  for (const [slotName, children] of Object.entries(node.slots)) {
    slotProps[slotName] = children.map((child, index) => (
      <NodeRenderer
        key={child.nodeId ?? index}
        node={child}
        config={config}
        viewports={viewports}
        activeViewportIndex={activeViewportIndex}
        fallbackViewportIndex={fallbackViewportIndex}
        renderUnknown={renderUnknown}
      />
    ));
  }

  const entry = isExperienceTemplate ? config.experienceTemplates?.[id] : config.components[id];
  if (!entry) {
    // An unregistered Experience Template would blank the page if we swapped
    // it for the missing-component box, so warn and render its slot children
    // unwrapped — the content survives, the diagnostic names what's missing.
    if (isExperienceTemplate) {
      if (typeof console !== 'undefined') {
        console.warn(
          `[@contentful/experiences-react] No experience template registered for id "${id}". Rendering its slot children without the experience template wrapper.`
        );
      }
      return <Fragment>{Object.values(slotProps).flat()}</Fragment>;
    }
    return createElement(renderUnknown, { componentId: id, nodeId: node.nodeId });
  }
  const registrationConfig = isExperienceTemplate
    ? normalizeExperienceTemplateRegistration(entry)
    : normalizeComponentRegistration(entry);

  const { props: tokenResolvedDesign, unresolved } = selectResolvedDesign(
    node.props,
    viewports,
    activeViewportIndex,
    fallbackViewportIndex,
    config.resolveToken
  );
  if (unresolved.length && typeof console !== 'undefined') {
    console.warn(
      `[@contentful/experiences-react] resolveToken returned undefined for token id(s) on ${kind} "${id}": ${unresolved.join(', ')}. useDesignValues() will omit those keys.`
    );
  }

  // Merge precedence (last wins): defaults < design < content < resolveData < slots.
  const composed = {
    ...registrationConfig.defaults,
    ...tokenResolvedDesign,
    ...node.props.content,
    ...node.props.resolved,
    ...slotProps,
  };

  const element = (
    <ResolvedDesignProvider value={tokenResolvedDesign}>
      {createElement(registrationConfig.component, composed)}
    </ResolvedDesignProvider>
  );

  if (isExperienceTemplate) {
    const contentful: ContentfulExperienceTemplate = {
      experienceTemplateId: id,
      nodeId: node.nodeId,
      content: node.props.content,
      design: node.props.designRaw,
      resolved: node.props.resolved,
    };
    return (
      <ContentfulExperienceTemplateProvider value={contentful}>
        {element}
      </ContentfulExperienceTemplateProvider>
    );
  }

  const contentful: ContentfulComponent = {
    componentId: id,
    nodeId: node.nodeId,
    content: node.props.content,
    design: node.props.designRaw,
    resolved: node.props.resolved,
  };
  return <ContentfulComponentProvider value={contentful}>{element}</ContentfulComponentProvider>;
}
