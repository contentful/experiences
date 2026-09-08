/** @vitest-environment jsdom */

import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExperiencePayload } from '@contentful/experiences-sdk-core';

import type { UseExperiencePlanOptions } from './use-experience-plan';
import { useExperiencePlan } from './use-experience-plan';

const payload = (title: string): ExperiencePayload => ({
  nodes: [
    {
      component: {
        sys: {
          type: 'ResourceLink',
          linkType: 'Contentful:Component',
          urn: 'crn:contentful:::experience:components/hero',
        },
      },
      contentProperties: { title },
      designProperties: {},
      slots: {},
    },
  ],
  sys: { type: 'Experience' },
  viewports: [
    {
      displayName: 'Default',
      id: 'default',
      previewSize: '1024px',
      query: '*',
    },
  ],
});

function ExperiencePlanProbe({ value }: { value: UseExperiencePlanOptions }): ReactElement {
  const { data } = useExperiencePlan(value);
  const title = data?.nodes[0]?.props.content.title;
  return <output>{typeof title === 'string' ? title : ''}</output>;
}

function renderRoot(): { container: HTMLElement; root: Root } {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  return { container, root };
}

describe('useExperiencePlan', () => {
  let root: Root | undefined;
  let container: HTMLElement | undefined;

  const initialPlan = {
    fallbackViewportIndex: 0,
    nodes: [
      {
        nodeId: 'initial',
        registration: { kind: 'component' as const, id: 'hero' },
        props: { content: { title: 'initial' }, design: {}, designRaw: {} },
        slots: {},
      },
    ],
    viewports: payload('initial').viewports,
    metadata: {},
    debug: false,
    diagnostics: [],
  };

  const resolveOptions = {
    config: { components: {} },
  };

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  });

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
    }
    container?.remove();
    vi.unstubAllGlobals();
  });

  it('keeps the initial plan until raw data resolves', async () => {
    ({ container, root } = renderRoot());

    await act(async () => {
      root.render(
        <ExperiencePlanProbe value={{ payload: undefined, initialPlan, resolveOptions }} />
      );
    });

    expect(container.textContent).toBe('initial');

    await act(async () => {
      root.render(
        <ExperiencePlanProbe value={{ payload: payload('updated'), initialPlan, resolveOptions }} />
      );
      await Promise.resolve();
    });

    expect(container.textContent).toBe('updated');
  });

  it('retains the initial plan when resolving raw data fails', async () => {
    const failingResolveOptions = {
      config: {
        components: {
          hero: {
            resolveData: () => Promise.reject(new Error('resolver failed')),
          },
        },
      },
    };

    ({ container, root } = renderRoot());

    await act(async () => {
      root.render(
        <ExperiencePlanProbe
          value={{
            payload: payload('failed'),
            initialPlan,
            resolveOptions: failingResolveOptions,
          }}
        />
      );
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toBe('initial');
  });

  it('allows only the latest async resolution to update the plan', async () => {
    let resolveFirst: ((value: Record<string, unknown>) => void) | undefined;
    let resolveSecond: ((value: Record<string, unknown>) => void) | undefined;
    let resolveCall = 0;

    const controlledResolveOptions = {
      config: {
        components: {
          hero: {
            resolveData: () =>
              new Promise<Record<string, unknown>>((resolve) => {
                resolveCall += 1;
                if (resolveCall === 1) resolveFirst = resolve;
                else resolveSecond = resolve;
              }),
          },
        },
      },
    };

    ({ container, root } = renderRoot());

    await act(async () => {
      root.render(
        <ExperiencePlanProbe
          value={{
            payload: payload('first'),
            initialPlan,
            resolveOptions: controlledResolveOptions,
          }}
        />
      );
    });

    await vi.waitFor(() => expect(resolveCall).toBe(1));

    await act(async () => {
      root.render(
        <ExperiencePlanProbe
          value={{
            payload: payload('second'),
            initialPlan,
            resolveOptions: controlledResolveOptions,
          }}
        />
      );
    });
    await vi.waitFor(() => expect(resolveCall).toBe(2));

    await act(async () => {
      resolveSecond?.({});
      await Promise.resolve();
    });
    expect(container.textContent).toBe('second');

    await act(async () => {
      resolveFirst?.({});
      await Promise.resolve();
    });
    expect(container.textContent).toBe('second');
  });
});
