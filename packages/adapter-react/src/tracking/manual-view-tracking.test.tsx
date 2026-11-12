/** @vitest-environment jsdom */

import { act, createRef, StrictMode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ManualViewTracking } from '../client.js';
import { createReactTestRoot, type ReactTestRoot } from '../test/react-root.js';

describe('ManualViewTracking', () => {
  let view: ReactTestRoot;
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    view = createReactTestRoot();
  });
  afterEach(async () => {
    await act(async () => view.cleanup());
    vi.unstubAllGlobals();
  });

  it('preserves opaque content, attributes and refs through SSR, hydration and updates without context', async () => {
    const ref = createRef<HTMLDivElement>();
    const tree = (label: string) => (
      <StrictMode>
        <ManualViewTracking ref={ref} className="manual" aria-label="manual content">
          <article data-ctfl-scopes="inner">{label}</article>
        </ManualViewTracking>
      </StrictMode>
    );
    const content = tree('Server content & text');
    view.container.innerHTML = renderToStaticMarkup(content);
    const boundary = view.container.firstElementChild;
    const root = boundary!.firstElementChild;
    expect(boundary?.getAttribute('data-ctfl-manual-views')).toBe('true');
    expect(boundary?.getAttribute('aria-label')).toBe('manual content');
    expect(boundary?.className).toBe('manual');
    expect(root?.getAttribute('data-ctfl-scopes')).toBe('inner');
    const recover = vi.fn();
    await act(async () => view.hydrate(content, { onRecoverableError: recover }));
    expect(recover).not.toHaveBeenCalled();
    expect(ref.current).toBe(boundary);
    expect(ref.current?.firstElementChild).toBe(root);
    expect(root?.textContent).toBe('Server content & text');
    await act(async () => view.render(tree('updated')));
    expect(ref.current).toBe(boundary);
    expect(ref.current?.firstElementChild).toBe(root);
    expect(root?.textContent).toBe('updated');
    await act(async () => view.render(null));
    expect(ref.current).toBeNull();
  });
});
