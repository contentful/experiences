/** @vitest-environment jsdom */
// Delivery parameters, resolveData and adoption of the replacement plan in the client renderer.

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { componentNode } from '../../test/fixtures/payload.js';

import { fetchExperience, type ExperienceParameters } from '../../index';
import type { Config } from '../../registry/types';
import { ClientExperienceRenderer } from '../../rendering/client-renderer';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

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

describe('runtime parameter refetch → renderer', () => {
  it('replaces content for the same Experience and node after parameters change', async () => {
    const get = vi.fn(
      async (
        _id: string,
        _request: unknown,
        options: { queryParams?: Record<string, unknown> } = {}
      ) => ({
        sys: { id: 'collection', type: 'Experience' },
        nodes: [
          componentNode('posts', {
            id: 'stable-node',
            contentProperties: {
              title: `${options.queryParams?.['parameter.featuredPosts.limit']} posts`,
            },
          }),
        ],
      })
    );
    const client = { experience: { get } } as never;
    const resolveData = vi.fn(({ content }: { content: Record<string, unknown> }) => ({
      title: String(content.title).toUpperCase(),
    }));
    const config: Config = {
      components: {
        posts: { component: ({ title }: { title: string }) => <p>{title}</p>, resolveData },
      },
    };
    const options = { spaceId: 'space', environmentId: 'master', experienceId: 'collection' };
    const parameters: ExperienceParameters = {
      featuredPosts: { limit: 6, order: '-fields.title' },
    };
    const first = await fetchExperience({ ...options, parameters }, { client }, { config });
    await mount(<ClientExperienceRenderer experience={first} config={config} />);
    expect(container!.textContent).toBe('6 POSTS');

    const second = await fetchExperience(
      { ...options, parameters: { featuredPosts: { limit: 12, order: 'sys.createdAt' } } },
      { client },
      { config }
    );
    await act(async () => {
      root!.render(<ClientExperienceRenderer experience={second} config={config} />);
    });
    expect(container!.textContent).toBe('12 POSTS');
    expect(first.nodes[0]?.nodeId).toBe(second.nodes[0]?.nodeId);
    expect(resolveData).toHaveBeenCalledTimes(2);
  });
});
