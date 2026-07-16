/*
 * Recursive renderer over PortableRenderNodes. Pre-renders slot subtrees
 * into ReactNodes during recursion so customer components receive already-
 * rendered ReactNodes by slot name (typically `children`).
 *
 * Customer components receive the merged prop bag (defaults + content +
 * resolveData output + slots). Design values are NOT injected as props — a
 * component reads them via `useDesignValues()`. The renderer resolves each
 * node's design once (viewport cascade + `resolveToken`) and publishes it on
 * context for that hook. The Experience runtime context and the raw
 * Contentful payload are read via the hooks in `./context`.
 *
 * Server vs client variants share this component; they differ only in how
 * the active viewport is sourced (initial seed vs reactive matchMedia).
 */

import { Fragment, createElement, type ReactNode } from 'react';

import type {
  PortableRenderNode,
  PortableTemplate,
  ViewportDef,
} from '@contentful/experiences-core';
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

/*
 * The internal renderers take `viewports` + `activeViewportIndex` as separate
 * props rather than the whole `RenderContext` object. The full context is
 * published once through `ExperienceProvider` (a client component); threading
 * the same object again as an element prop would make React's RSC (Flight)
 * serializer emit it as a shared reference and then back-patch it into the
 * frozen element props on the client — "Cannot assign to read only property
 * 'experience'". Passing the two primitives keeps each element's props a
 * self-contained value with no shared object identity to reconcile.
 */

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
        viewports={viewports}
        activeViewportIndex={activeViewportIndex}
        renderUnknown={renderUnknown}
      />
    );
  }

  // Resolve viewport-keyed design values into plain scalars at render time
  // (so client viewport changes don't invalidate the resolveData step), then
  // pass any DesignToken envelopes through the customer's resolveToken hook.
  // The result is published on context for useDesignValues(); it is NOT
  // spread onto the component's props.
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

  // Merge precedence (last wins): defaults < content < resolveData output <
  // slots. Design values are deliberately excluded — components read them via
  // useDesignValues() so the SDK never injects unknown cf-prefixed props.
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
 * Wraps the rendered Experience nodes with the page-level template when the
 * plan carries one and the customer registered a template config under that
 * id. When the template is referenced but unregistered, warns once and
 * renders children unwrapped — graceful degradation matches the
 * unknown-component fallback story.
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

  // Design values are excluded from props here too — template chrome reads
  // them via useDesignValues().
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
