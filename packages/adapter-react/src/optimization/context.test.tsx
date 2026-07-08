import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type {
  ExperiencesOptimizationAdapter,
  ResolvedNodeMetadata,
} from '@contentful/optimization-react-web/experiences-adapter';

import {
  OptimizationNodeProvider,
  OptimizationProvider,
  useOptimization,
  useOptimizationRuntime,
  type OptimizationRuntime,
} from './context';

function makeAdapter(): ExperiencesOptimizationAdapter {
  return {
    useNodeBinding: () => ({ ref: () => {}, resolved: null }),
    attachInteractionRuntime: () => () => {},
  };
}

function CaptureRuntime({
  onCapture,
}: {
  onCapture: (runtime: OptimizationRuntime | null) => void;
}): ReactNode {
  onCapture(useOptimizationRuntime());
  return null;
}

function CaptureResolved({
  onCapture,
}: {
  onCapture: (resolved: ResolvedNodeMetadata | null) => void;
}): ReactNode {
  onCapture(useOptimization().resolved);
  return null;
}

describe('useOptimizationRuntime', () => {
  it('returns null when no OptimizationProvider is mounted', () => {
    let captured: OptimizationRuntime | null | undefined;
    renderToStaticMarkup(<CaptureRuntime onCapture={(r) => (captured = r)} />);
    expect(captured).toBeNull();
  });

  it('returns the exact runtime reference passed to OptimizationProvider', () => {
    const runtime: OptimizationRuntime = {
      adapter: makeAdapter(),
      sourceMap: undefined,
    };
    let captured: OptimizationRuntime | null | undefined;
    renderToStaticMarkup(
      <OptimizationProvider value={runtime}>
        <CaptureRuntime onCapture={(r) => (captured = r)} />
      </OptimizationProvider>,
    );
    expect(captured).toBe(runtime);
  });
});

describe('useOptimization', () => {
  it('returns { resolved: null } when no OptimizationNodeProvider is mounted', () => {
    let captured: ResolvedNodeMetadata | null | undefined;
    renderToStaticMarkup(<CaptureResolved onCapture={(r) => (captured = r)} />);
    expect(captured).toBeNull();
  });

  it('returns the ResolvedNodeMetadata published by OptimizationNodeProvider', () => {
    const resolved: ResolvedNodeMetadata = {
      entityId: 'entity-1',
      entityKind: 'Experience',
      optimizationId: 'opt-1',
      variantId: 'variant-a',
      variantIndex: 0,
    };
    let captured: ResolvedNodeMetadata | null | undefined;
    renderToStaticMarkup(
      <OptimizationNodeProvider value={resolved}>
        <CaptureResolved onCapture={(r) => (captured = r)} />
      </OptimizationNodeProvider>,
    );
    expect(captured).toBe(resolved);
  });
});
