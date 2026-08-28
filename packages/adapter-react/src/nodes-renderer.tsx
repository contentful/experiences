/*
 * Recursive renderer over PortableRenderNodes. Resolved design values auto-fill
 * matching props (below content/resolveData) and are also available via
 * `useDesignValues()`.
 */

import { Fragment, createElement, type ReactNode } from 'react';

import type { PortableRenderNode, ViewportDef } from '@contentful/experiences-sdk-core';
import { selectResolvedDesign } from '@contentful/experiences-design';

import { ComponentErrorBoundary } from './component-error-boundary';
import type { ComponentErrorProps } from './component-error';
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
export type RenderError = (props: ComponentErrorProps) => ReactNode;

/**
 * Reports one render-time diagnostic (unregistered id, a component that
 * threw). `ServerExperienceRenderer` passes a closure that pushes onto a
 * plain array (SSR is synchronous top-down, so the array is fully populated
 * by the time `<DebugExperience>` reads it — see the element-order note
 * there). `ClientExperienceRenderer` passes a `setState` updater instead, so
 * `<DebugExperience>` re-renders reactively when a later interaction throws.
 */
export type DiagnosticReporter = (error: Error) => void;

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
  renderError: RenderError;
  onDiagnostic: DiagnosticReporter;
}

export function NodesRenderer({
  nodes,
  config,
  viewports,
  activeViewportIndex,
  fallbackViewportIndex,
  renderUnknown,
  renderError,
  onDiagnostic,
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
          renderError={renderError}
          onDiagnostic={onDiagnostic}
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
  renderError: RenderError;
  onDiagnostic: DiagnosticReporter;
}

function NodeRenderer({
  node,
  config,
  viewports,
  activeViewportIndex,
  fallbackViewportIndex,
  renderUnknown,
  renderError,
  onDiagnostic,
}: NodeRendererProps): ReactNode {
  const { kind, id } = node.registration;
  const isExperienceTemplate = kind === 'experienceTemplate';

  // Diagnostics are reported straight to `onDiagnostic`, synchronously during
  // render. Deliberate: this component is shared between SSR and CSR, and
  // `useEffect` never runs during `renderToStaticMarkup`/streaming SSR — an
  // effect-deferred report would silently vanish on the server.
  //
  // Dedup lives in `onDiagnostic` (see both renderers), not here. An ancestor
  // re-render re-executes this whole function, so an unregistered id or
  // malformed slot would otherwise be re-reported every time — the collectors
  // drop a message they already hold. Keeping the guard there rather than in a
  // `useRef` is what lets this module stay hook-free, and therefore usable from
  // a React Server Component: `ServerExperienceRenderer` renders it without a
  // `'use client'` boundary, which is what keeps `config` (component
  // references, unserializable) from having to cross one.

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
    // Defensive: `node.slots[x]` is typed as an array, but a hand-built
    // PortableRenderPlan (a supported path — customers can construct one
    // directly instead of going through `resolveExperience`) is not
    // type-checked at runtime. Warn + drop rather than letting `.map` throw.
    if (!Array.isArray(children)) {
      const message =
        `Slot "${slotName}" on ${kind} "${id}"${node.nodeId ? ` (node "${node.nodeId}")` : ''} ` +
        `is not an array of nodes; rendering it as empty instead of throwing.`;
      if (typeof console !== 'undefined') {
        console.warn(`[@contentful/experiences-react] ${message}`);
      }
      onDiagnostic(new Error(message));
      slotProps[slotName] = [];
      continue;
    }
    slotProps[slotName] = children.map((child, index) => (
      <NodeRenderer
        key={child.nodeId ?? index}
        node={child}
        config={config}
        viewports={viewports}
        activeViewportIndex={activeViewportIndex}
        fallbackViewportIndex={fallbackViewportIndex}
        renderUnknown={renderUnknown}
        renderError={renderError}
        onDiagnostic={onDiagnostic}
      />
    ));
  }

  const entry = isExperienceTemplate ? config.experienceTemplates?.[id] : config.components[id];
  if (!entry) {
    // An unregistered Experience Template would blank the page if we swapped
    // it for the missing-component box, so warn and render its slot children
    // unwrapped — the content survives, the diagnostic names what's missing.
    if (isExperienceTemplate) {
      const message = `No experience template registered for id "${id}". Rendering its slot children without the experience template wrapper.`;
      if (typeof console !== 'undefined') {
        console.warn(`[@contentful/experiences-react] ${message}`);
      }
      onDiagnostic(new Error(message));
      return <Fragment>{Object.values(slotProps).flat()}</Fragment>;
    }
    // `MissingComponent` (the default `renderUnknown`) does its own
    // console.warn; a custom override may not, so the diagnostic is recorded
    // here regardless of which fallback ends up rendering.
    onDiagnostic(
      new Error(
        `No component registered for id "${id}"${node.nodeId ? ` (nodeId: ${node.nodeId})` : ''}.`
      )
    );
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
      <ComponentErrorBoundary
        fallback={createElement(renderError, { componentId: id, nodeId: node.nodeId })}
        componentId={id}
        kind={kind}
        nodeId={node.nodeId}
      >
        {createElement(registrationConfig.component, composed)}
      </ComponentErrorBoundary>
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

// `ComponentErrorBoundary` lives in its own `'use client'` file — see
// component-error-boundary.tsx for why (it's a class component, which
// Next.js's RSC bundler rejects from a directive-free file).
