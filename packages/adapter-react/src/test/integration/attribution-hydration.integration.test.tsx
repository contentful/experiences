/** @vitest-environment jsdom */

import { act } from 'react';
import { createDomTestRoot, type DomTestRoot } from '../dom-root.js';
import { componentNode } from '../fixtures/payload.js';
import { minimalSourceMap } from '../fixtures/source-map.js';
import { planNode } from '../fixtures/plan-node.js';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveExperience } from '@contentful/experiences-sdk-core';

import { useContentfulComponent } from '../../rendering/context';
import { getTrackingAttributes } from '../../index';
import { ServerExperienceRenderer } from '../../rendering/server-renderer';
import type { Config } from '../../registry/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Box() {
  const tracking = getTrackingAttributes(useContentfulComponent()?.attribution);
  return <section {...tracking}>content</section>;
}

const config: Config = { components: { box: Box } };
const nodes = [componentNode('box', { id: 'n' })];
const sourceMap = minimalSourceMap({ leaf: { kind: 'Component', id: 'box' } });
let root: DomTestRoot | undefined;

afterEach(() => {
  act(() => root?.cleanup());
  root = undefined;
  vi.restoreAllMocks();
});

describe('hydrating a server-rendered tree that carries attribution', () => {
  it.each([true, false])('hydrates with no mismatch (attributed=%s)', async (attributed) => {
    const plan = attributed
      ? await resolveExperience({ nodes }, config, { sourceMap })
      : { nodes: [planNode('component', 'box')], metadata: {}, debug: false, diagnostics: [] };
    const element = <ServerExperienceRenderer experience={plan} config={config} />;
    const serverHtml = renderToString(element);
    root = createDomTestRoot();
    const { container } = root;
    container.innerHTML = serverHtml;
    const recoverable = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await act(async () => {
      root!.hydrate(element, { onRecoverableError: recoverable });
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
