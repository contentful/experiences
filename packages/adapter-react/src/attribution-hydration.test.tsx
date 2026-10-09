/** @vitest-environment jsdom */

/*
 * SSR then hydration, with the real renderers. The server renders the tree,
 * `hydrateRoot` adopts it in a DOM, and React reports a mismatch through
 * `onRecoverableError`. Attribution must not cause one: `getTrackingAttributes`
 * derives from the same serializable plan on both sides.
 */
import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveExperience } from '@contentful/experiences-sdk-core';

import { useContentfulComponent } from './context';
import { getTrackingAttributes } from './index';
import { ServerExperienceRenderer } from './server-renderer';
import type { Config } from './types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Box() {
  const tracking = getTrackingAttributes(useContentfulComponent()?.attribution);
  return <section {...tracking}>content</section>;
}

const config: Config = { components: { box: Box } };
const nodes = [
  {
    id: 'n',
    component: {
      sys: {
        type: 'ResourceLink' as const,
        linkType: 'Contentful:Component' as const,
        urn: 'crn:contentful:::experience:spaces/$self/environments/$self/components/box',
      },
    },
  },
];
const sourceMap = {
  version: 1,
  variants: [{ type: 'personalization', id: 'default' }],
  spaces: [],
  environments: [],
  locales: [],
  entries: [],
  assets: [],
  layers: [
    { kind: 'Experience', id: 'exp-a', variants: [0] },
    { kind: 'Component', id: 'box' },
  ],
  dataAssemblies: [],
  nodes: { n: { layers: [1, 0], scope: 0, contentProperties: [] } },
};

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('hydrating a server-rendered tree that carries attribution', () => {
  it.each([
    ['with a source map', { sourceMap }],
    ['without a source map', {}],
    ['with an unusable source map', { sourceMap: { ...sourceMap, version: 99 } }],
  ])('adopts the server markup with no mismatch, %s', async (_label, options) => {
    const plan = await resolveExperience({ nodes }, config, options as never);
    const element = <ServerExperienceRenderer experience={plan} config={config} />;
    const serverHtml = renderToString(element);
    const container = document.createElement('div');
    container.innerHTML = serverHtml;
    document.body.append(container);
    const recoverable = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await act(async () => {
      hydrateRoot(container, element, { onRecoverableError: recoverable });
    });

    expect(recoverable).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    // Hydration kept the server's markup, including the stamped attribute.
    expect(container.innerHTML).toBe(serverHtml);
    const key = Object.values(plan.attribution?.scopes ?? {})[0]?.key;
    if (key === undefined) {
      expect(serverHtml).not.toContain('data-ctfl-scopes');
    } else {
      expect(container.querySelector('section')?.getAttribute('data-ctfl-scopes')).toBe(key);
    }
  });
});
