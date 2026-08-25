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

function mount(element: React.ReactElement): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(element);
  });
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

      mount(<ClientExperienceRenderer experience={plan} config={config} debug />);

      expect(container!.querySelector('[data-fine]')).not.toBeNull();
      expect(container!.querySelector('[data-experiences-render-error="broken"]')).not.toBeNull();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('boom'));

      // The error boundary's onError call updates ClientExperienceRenderer's
      // render-diagnostics state; DebugExperience should reflect it once
      // React settles.
      const errorList = container!.querySelector('[data-experiences-debug-errors]');
      expect(errorList).not.toBeNull();
      expect(errorList!.textContent).toContain('component-render-error');
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

      mount(<ClientExperienceRenderer experience={plan} config={config} />);

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

    mount(<ClientExperienceRenderer experience={plan} config={config} renderError={CustomError} />);

    expect(container!.querySelector('[data-custom-error="broken"]')).not.toBeNull();
  });
});
