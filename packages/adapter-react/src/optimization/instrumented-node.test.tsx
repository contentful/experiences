import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type {
  ExperiencesOptimizationAdapter,
  ResolvedNodeMetadata,
} from '@contentful/optimization-react-web/experiences-adapter';

import type { DeliveryViewSourceMap } from '@contentful/experiences-core';

import { OptimizationProvider, useOptimization } from './context';
import { InstrumentedNode } from './instrumented-node';

const RESOLVED: ResolvedNodeMetadata = {
  entityId: 'entity-1',
  entityKind: 'Experience',
  optimizationId: 'opt-1',
  variantId: 'variant-a',
  variantIndex: 0,
};

const EMPTY_SOURCE_MAP: DeliveryViewSourceMap = {
  version: 1,
  variants: [],
  spaces: [],
  environments: [],
  locales: [],
  entries: [],
  assets: [],
  layers: [],
  dataAssemblies: [],
  nodes: {},
};

function makeAdapter(
  resolveMap: Record<string, ResolvedNodeMetadata | null>,
): ExperiencesOptimizationAdapter {
  return {
    useNodeBinding: (nodeId) => ({
      ref: () => {},
      resolved: resolveMap[nodeId] ?? null,
    }),
    attachInteractionRuntime: () => () => {},
  };
}

function CaptureResolved({
  onCapture,
}: {
  onCapture: (resolved: ResolvedNodeMetadata | null) => void;
}): ReactNode {
  onCapture(useOptimization().resolved);
  return null;
}

describe('InstrumentedNode', () => {
  it('renders children unchanged when the adapter resolves to null', () => {
    const adapter = makeAdapter({ 'node-x': null });
    const markup = renderToStaticMarkup(
      <InstrumentedNode adapter={adapter} nodeId="node-x" sourceMap={EMPTY_SOURCE_MAP}>
        <span data-testid="inner">hi</span>
      </InstrumentedNode>,
    );
    expect(markup).toBe('<span data-testid="inner">hi</span>');
    expect(markup).not.toContain('data-ctfl-node-id');
    expect(markup).not.toContain('display:contents');
  });

  it('wraps children in a display:contents div with data-ctfl-node-id when resolved', () => {
    const adapter = makeAdapter({ 'node-x': RESOLVED });
    const markup = renderToStaticMarkup(
      <InstrumentedNode adapter={adapter} nodeId="node-x" sourceMap={EMPTY_SOURCE_MAP}>
        <span data-testid="inner">hi</span>
      </InstrumentedNode>,
    );
    expect(markup).toContain('data-ctfl-node-id="node-x"');
    expect(markup).toContain('style="display:contents"');
    expect(markup).toContain('<span data-testid="inner">hi</span>');
  });

  it('publishes the resolved metadata to useOptimization() when wrapping', () => {
    const adapter = makeAdapter({ 'node-x': RESOLVED });
    let captured: ResolvedNodeMetadata | null | undefined;
    renderToStaticMarkup(
      <InstrumentedNode adapter={adapter} nodeId="node-x" sourceMap={EMPTY_SOURCE_MAP}>
        <CaptureResolved onCapture={(r) => (captured = r)} />
      </InstrumentedNode>,
    );
    expect(captured).toBe(RESOLVED);
  });

  it('leaves useOptimization() at null when the node is not personalized', () => {
    const adapter = makeAdapter({ 'node-x': null });
    let captured: ResolvedNodeMetadata | null | undefined;
    renderToStaticMarkup(
      <OptimizationProvider value={{ adapter, sourceMap: EMPTY_SOURCE_MAP }}>
        <InstrumentedNode adapter={adapter} nodeId="node-x" sourceMap={EMPTY_SOURCE_MAP}>
          <CaptureResolved onCapture={(r) => (captured = r)} />
        </InstrumentedNode>
      </OptimizationProvider>,
    );
    expect(captured).toBeNull();
  });
});
