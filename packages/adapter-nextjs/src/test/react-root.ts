import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, vi } from 'vitest';

/** Scope DOM ownership to the calling suite; keep each render's act boundary explicit. */
export function testRoot() {
  const view = {} as { root: Root; container: HTMLDivElement };
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    view.container = document.createElement('div');
    document.body.append(view.container);
    view.root = createRoot(view.container);
  });
  afterEach(async () => {
    try {
      await act(async () => view.root.unmount());
    } finally {
      view.container.remove();
      vi.unstubAllGlobals();
    }
  });
  return view;
}
