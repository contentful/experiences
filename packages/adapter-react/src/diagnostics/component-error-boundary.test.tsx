import { Writable } from 'node:stream';
import { renderToPipeableStream, renderToStaticMarkup } from 'react-dom/server';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDomTestRoot, type DomTestRoot } from '../test/dom-root';
import { ExperienceProvider } from '../rendering/context';
import { ComponentError } from './component-error';
import { ComponentErrorBoundary } from './component-error-boundary';

function Broken(): never {
  throw new Error('boom');
}
let view: DomTestRoot | undefined;
afterEach(() => {
  act(() => view?.cleanup());
  view = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe.runIf(typeof document !== 'undefined')('ComponentErrorBoundary client', () => {
  it('runs against a real browser document', () => {
    expect(document.createElement('div').ownerDocument).toBe(document);
  });
  it('renders nothing visible from the default fallback when debug is off, but still warns', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    view = createDomTestRoot();
    await act(async () =>
      view!.render(
        <ExperienceProvider value={{ debug: false, metadata: {} }}>
          <ComponentErrorBoundary
            componentId="broken"
            kind="component"
            fallback={<ComponentError componentId="broken" />}
          >
            <Broken />
          </ComponentErrorBoundary>
        </ExperienceProvider>
      )
    );
    expect(view.container.querySelector('[data-experiences-render-error]')).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });

  it('honors a custom error fallback', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    view = createDomTestRoot();
    await act(async () =>
      view!.render(
        <ComponentErrorBoundary
          componentId="broken"
          kind="component"
          fallback={<div data-custom-error="broken" />}
        >
          <Broken />
        </ComponentErrorBoundary>
      )
    );
    expect(view.container.querySelector('[data-custom-error="broken"]')).not.toBeNull();
  });
});

const Fine = () => <span data-fine>sibling</span>;
function recovery(debug = false) {
  return (
    <ExperienceProvider value={{ debug, metadata: {} }}>
      <ComponentErrorBoundary
        componentId="broken"
        kind="component"
        nodeId="b"
        fallback={<ComponentError componentId="broken" nodeId="b" />}
      >
        <Broken />
      </ComponentErrorBoundary>
      <Fine />
    </ExperienceProvider>
  );
}
function renderToStreamedHtml(element: React.ReactElement): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    const writable = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(chunk.toString());
        cb();
      },
    });
    const { pipe } = renderToPipeableStream(element, {
      onAllReady() {
        pipe(writable);
        writable.on('finish', () => resolve(chunks.join('')));
      },
      onShellError: reject,
      // Fizz reports the recovered-from error here too; that's Next's own
      // instrumentation hook, orthogonal to our diagnostics — not asserted on.
      onError() {},
    });
  });
}

describe.runIf(typeof document === 'undefined')(
  'ComponentErrorBoundary — component-render-error under Fizz (renderToPipeableStream)',
  () => {
    it('emits the debug fallback markup as the Suspense recovery content when debug is on', async () => {
      expect(typeof window).toBe('undefined');
      expect(typeof document).toBe('undefined');
      const html = await renderToStreamedHtml(recovery(true));
      expect(html).toContain('data-experiences-render-error="broken"');
    });

    it('never records a diagnostic or warns during the SSR pass itself', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        await renderToStreamedHtml(recovery());

        // `getDerivedStateFromError` — and therefore our reporting inside its
        // `render()` — never runs server-side under Fizz; only Suspense
        // recovery does. Diagnostics for this failure mode only ever surface
        // client-side, after hydration.
        expect(warn).not.toHaveBeenCalled();
      } finally {
        warn.mockRestore();
      }
    });
  }
);

describe.runIf(typeof document === 'undefined')(
  'ComponentErrorBoundary — component-render-error under the legacy renderToStaticMarkup',
  () => {
    it('degrades gracefully too — fallback renders, sibling isolated, no crash', async () => {
      // Same Suspense-fallback mechanism as the streaming renderer — this API
      // isn't documented to honor Suspense for a thrown Error (only for a
      // thrown thenable), but it empirically does, so it's locked in here
      // rather than left as an assumption.
      const html = renderToStaticMarkup(recovery());
      expect(html).toContain('data-fine');
    });

    it('never records a diagnostic — legacy output has no hydration retry to catch it', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        renderToStaticMarkup(recovery());

        expect(warn).not.toHaveBeenCalled();
      } finally {
        warn.mockRestore();
      }
    });
  }
);
