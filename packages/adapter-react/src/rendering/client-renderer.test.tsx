/** @vitest-environment jsdom */
// Client-owned diagnostic collection, rerender deduplication and boundary-ref warnings.
// Direct catching and SSR recovery live with ComponentErrorBoundary.

import { act, forwardRef, StrictMode, type HTMLAttributes } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { componentNode } from '../test/fixtures/payload.js';

import type { ExperiencePayload } from '@contentful/experiences-sdk-core';
import { resolveExperience } from '@contentful/experiences-sdk-core';

import type { Config } from '../registry/types';
import type { OnExperienceNodeRoot } from '../tracking/root-binding-types';
import { ClientExperienceRenderer } from './client-renderer';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function Broken(): never {
  throw new Error('boom');
}

const Fine = () => <span data-fine>sibling</span>;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

// Render-time diagnostics (component-not-registered, malformed-slot,
// experience-template-not-registered) reach ClientExperienceRenderer's state
// via a `queueMicrotask`-deferred setState (see client-renderer.tsx) so the
// update never lands mid-render of a different component. `mount` always
// flushes that microtask before returning — not just for tests that assert
// on the result, but so a test that doesn't care (e.g. one only checking the
// fallback DOM) never leaves the update to fire later, unwrapped in any
// test's `act()`, bleeding a warning into whichever test runs next.
async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

async function mount(element: React.ReactElement): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(element);
  });
  await flushMicrotasks();
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('ClientExperienceRenderer — component-render-error, client-side catch', () => {
  it('isolates the failing node, records a diagnostic, and shows it in DebugExperience', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const payload: ExperiencePayload = {
        nodes: [componentNode('broken', { id: 'b' }), componentNode('fine', { id: 'f' })],
      };
      const config: Config = { components: { broken: Broken, fine: Fine } };
      const plan = await resolveExperience(payload, config);

      await mount(<ClientExperienceRenderer experience={plan} config={config} debug />);

      expect(container!.querySelector('[data-fine]')).not.toBeNull();
      expect(container!.querySelector('[data-experiences-render-error="broken"]')).not.toBeNull();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('boom'));

      // The error boundary's onError call updates ClientExperienceRenderer's
      // render-diagnostics state; DebugExperience should reflect it once
      // React settles.
      const errorList = container!.querySelector('[data-experiences-debug-errors]');
      expect(errorList).not.toBeNull();
      expect(errorList!.textContent).toContain('Component "broken"');
      expect(errorList!.textContent).toContain('boom');
    } finally {
      warn.mockRestore();
    }
  });
});

describe('ClientExperienceRenderer — render-time diagnostics dedupe across re-renders', () => {
  it('reports a persistently-unregistered component only once, not once per re-render', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const payload: ExperiencePayload = {
        nodes: [componentNode('missing', { id: 'm' })],
      };
      const config: Config = { components: {} };
      const plan = await resolveExperience(payload, config);

      await mount(<ClientExperienceRenderer experience={plan} config={config} debug />);
      // Force NodeRenderer to re-execute its function body without any real
      // new occurrence — an ancestor re-render (an
      // unrelated parent state update) does the same thing in production.
      act(() => {
        root!.render(<ClientExperienceRenderer experience={plan} config={config} debug />);
      });
      await flushMicrotasks();

      expect(container!.querySelectorAll('[data-experiences-debug-errors] li')).toHaveLength(1);
      expect(container!.textContent).toContain('No component registered for id "missing"');
    } finally {
      warn.mockRestore();
    }
  });
});

describe('ClientExperienceRenderer boundary ref warning', () => {
  it.each([
    ['development', 1],
    ['production', 0],
  ] as const)(
    'warns once for a missing custom boundary ref in %s',
    async (environment, warnings) => {
      vi.stubEnv('NODE_ENV', environment);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const experience = await resolveExperience(
        { nodes: [componentNode('probe', { contentProperties: { title: 'hello' } })] },
        { components: { probe: () => null } }
      );
      const ForwardedNode = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>((props, ref) => (
        <article {...props} ref={ref} />
      ));
      const DroppedRef = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>((props, _ref) => (
        <section {...props} />
      ));
      const callback = vi.fn<OnExperienceNodeRoot>();
      container = document.createElement('div');
      document.body.append(container);
      root = createRoot(container);
      await act(async () =>
        root!.render(
          <StrictMode>
            <ClientExperienceRenderer
              experience={experience}
              config={{ components: { probe: ForwardedNode } }}
              as={DroppedRef}
              onNodeRoot={callback}
            />
          </StrictMode>
        )
      );
      expect(warn).toHaveBeenCalledTimes(warnings);
      if (warnings) expect(warn).toHaveBeenCalledWith(expect.stringContaining('forward the ref'));
      expect(callback).not.toHaveBeenCalled();
    }
  );
});
