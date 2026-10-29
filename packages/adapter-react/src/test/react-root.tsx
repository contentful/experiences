import type { ReactNode } from 'react';
import { createRoot, hydrateRoot, type HydrationOptions, type Root } from 'react-dom/client';

export interface ReactTestRoot {
  readonly container: HTMLDivElement;
  render(children: ReactNode): void;
  hydrate(children: ReactNode, options?: HydrationOptions): void;
  cleanup(): void;
}

/** DOM/root ownership only; callers control React act and transition boundaries. */
export function createReactTestRoot(): ReactTestRoot {
  const container = document.createElement('div');
  document.body.append(container);
  let root: Root | undefined;
  let disposed = false;

  function assertActive(): void {
    if (disposed) throw new Error('React test root has already been cleaned up.');
  }

  return {
    container,
    render(children) {
      assertActive();
      root ??= createRoot(container);
      root.render(children);
    },
    hydrate(children, options) {
      assertActive();
      if (root) throw new Error('React test root already exists; hydrate before rendering.');
      root = hydrateRoot(container, children, options);
    },
    cleanup() {
      if (disposed) return;
      disposed = true;
      const currentRoot = root;
      root = undefined;
      try {
        currentRoot?.unmount();
      } finally {
        container.remove();
      }
    },
  };
}
