/**
 * @vitest-environment jsdom
 *
 * `component-render-error` isolation on the CLIENT — the one environment
 * where `ComponentErrorBoundary`'s own `getDerivedStateFromError`/`render()`
 * branch actually runs (see the long comment on that class in
 * `nodes-renderer.tsx`, and `nodes-renderer.ssr.test.tsx` for why neither SSR
 * renderer ever reaches it). This is the only test file in this package that
 * needs jsdom — the rest of the suite renders via `react-dom/server` and
 * needs no DOM (see AGENTS.md's "Run tests" section) — so the environment is
 * scoped to just this file via the docblock above rather than changed globally.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ComponentNode, ExperiencePayload } from '@contentful/experiences-sdk-core';
import { resolveExperience } from '@contentful/experiences-sdk-core';

import { ClientExperienceRenderer } from './client-renderer';
import type { Config } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- required global for react's act() outside a test-library wrapper
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const VIEWPORTS = [{ id: 'desktop', query: '*', displayName: 'Desktop', previewSize: '100%' }];

function componentNode(typeId: string, rest: Omit<ComponentNode, 'component'> = {}): ComponentNode {
  return {
    component: {
      sys: {
        type: 'ResourceLink',
        linkType: 'Contentful:Component',
        urn: `crn:contentful:::experience:spaces/$self/environments/$self/components/${typeId}`,
      },
    },
    ...rest,
  };
}

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
});

describe('ClientExperienceRenderer — component-render-error, client-side catch', () => {
  it('isolates the failing node, records a diagnostic, and shows it in DebugExperience', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const payload: ExperiencePayload = {
        viewports: VIEWPORTS,
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

  it('renders nothing visible from the default fallback when debug is off, but still warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const payload: ExperiencePayload = {
        viewports: VIEWPORTS,
        nodes: [componentNode('broken', { id: 'b' })],
      };
      const config: Config = { components: { broken: Broken } };
      const plan = await resolveExperience(payload, config);

      await mount(<ClientExperienceRenderer experience={plan} config={config} />);

      expect(container!.querySelector('[data-experiences-render-error]')).toBeNull();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('boom'));
    } finally {
      warn.mockRestore();
    }
  });

  it('honors a custom renderError override', async () => {
    const payload: ExperiencePayload = {
      viewports: VIEWPORTS,
      nodes: [componentNode('broken', { id: 'b' })],
    };
    const config: Config = { components: { broken: Broken } };
    const plan = await resolveExperience(payload, config);

    const CustomError = ({ componentId }: { componentId: string }) => (
      <div data-custom-error={componentId} />
    );

    await mount(
      <ClientExperienceRenderer experience={plan} config={config} renderError={CustomError} />
    );

    expect(container!.querySelector('[data-custom-error="broken"]')).not.toBeNull();
  });
});

describe('ClientExperienceRenderer — render-time diagnostics dedupe across re-renders', () => {
  it('reports a persistently-unregistered component only once, not once per re-render', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const payload: ExperiencePayload = {
        viewports: VIEWPORTS,
        nodes: [componentNode('missing', { id: 'm' })],
      };
      const config: Config = { components: {} };
      const plan = await resolveExperience(payload, config);

      await mount(<ClientExperienceRenderer experience={plan} config={config} debug />);
      // Force NodeRenderer to re-execute its function body without any real
      // new occurrence — an ancestor re-render (a viewport change, an
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
