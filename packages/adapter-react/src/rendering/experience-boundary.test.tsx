/** @vitest-environment jsdom */

import { act, forwardRef, type HTMLAttributes } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveExperience } from '@contentful/experiences-sdk-core';

import { ClientExperienceRenderer } from './client-renderer.js';
import { ServerExperienceRenderer } from './server-renderer.js';
import { minimalSourceMap } from '../test-fixtures/source-map.js';
import type { Config } from '../registry/types.js';
import type {
  ExperienceRootBinding,
  OnExperienceNodeRoot,
} from '../tracking/root-binding-types.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];
afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

const payload = {
  nodes: [
    {
      id: 'n',
      component: {
        sys: {
          type: 'ResourceLink' as const,
          linkType: 'Contentful:Component' as const,
          urn: 'crn:contentful:::experience:spaces/$self/environments/$self/components/probe',
        },
      },
      contentProperties: { title: 'hello' },
    },
  ],
};
function Probe({ title, ...props }: HTMLAttributes<HTMLElement> & { title?: string }) {
  return <article {...props}>{title}</article>;
}
const config: Config = { components: { probe: Probe } };
const plan = (withMap = true) =>
  resolveExperience(payload, config, withMap ? { sourceMap: minimalSourceMap() } : undefined);

describe('standard attributed Experience rendering', () => {
  it('disables automatic views while retaining data and independent click/hover overrides with ordinary forwarding', async () => {
    const experience = await plan();
    const Forwarded = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>((props, ref) => (
      <article {...props} ref={ref} />
    ));
    const ordinaryConfig: Config = { components: { probe: Forwarded } };
    const callback = vi.fn<OnExperienceNodeRoot>();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    await act(async () =>
      root.render(
        <ClientExperienceRenderer
          experience={experience}
          config={ordinaryConfig}
          trackViews={false}
          trackClicks
          trackHovers
          clickable
          onNodeRoot={callback}
        />
      )
    );
    const article = container.querySelector('article')!;
    expect(article.getAttribute('data-ctfl-scopes')).toBe(
      experience.nodes[0]!.attribution!.roots[0]!.key
    );
    expect(article.getAttribute('data-ctfl-track-views')).toBe('false');
    expect(article.getAttribute('data-ctfl-track-clicks')).toBe('true');
    expect(article.getAttribute('data-ctfl-track-hovers')).toBe('true');
    expect(article.getAttribute('data-ctfl-clickable')).toBe('true');
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0]![0].data).toBe(experience.nodes[0]!.attribution!.roots.at(-1));
    expect(
      JSON.parse(container.firstElementChild!.getAttribute('data-ctfl-attribution')!).scopes
    ).not.toEqual({});
  });
  it('re-registers changed registration defaults while keeping equivalent traversal snapshots stable', async () => {
    const experience = await plan();
    const cleanup = vi.fn();
    const callback = vi.fn<OnExperienceNodeRoot>(() => cleanup);
    function Bound({
      experienceRoot,
      label,
    }: {
      experienceRoot: ExperienceRootBinding;
      label?: string;
    }) {
      return <article {...experienceRoot.getRootProps()}>{label}</article>;
    }
    const registration = {
      component: Bound,
      root: { prop: 'experienceRoot' },
      defaults: { label: 'first' },
    };
    const boundConfig: Config = { components: { probe: registration } };
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    const element = () => (
      <ClientExperienceRenderer
        experience={experience}
        config={boundConfig}
        trackViews={false}
        onNodeRoot={callback}
      />
    );
    await act(async () => root.render(element()));
    await act(async () => root.render(element()));
    expect(callback).toHaveBeenCalledTimes(1);
    expect(cleanup).not.toHaveBeenCalled();
    registration.defaults = { label: 'second' };
    await act(async () => root.render(element()));
    expect(container.querySelector('article')?.textContent).toBe('second');
    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback.mock.calls[1]![0].node.props.label).toBe('second');
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('supplies one boundary and attributes actual component roots without node wrappers', async () => {
    const experience = await plan();
    const container = document.createElement('div');
    container.innerHTML = renderToString(
      <ServerExperienceRenderer experience={experience} config={config} />
    );
    const boundary = container.firstElementChild!;
    expect(boundary.tagName).toBe('DIV');
    expect(boundary.getAttribute('style')).toBe('display:contents');
    expect(JSON.parse(boundary.getAttribute('data-ctfl-attribution')!).scopes).toHaveProperty(
      Object.keys(experience.attribution!.scopes)[0]!
    );
    expect(boundary.children).toHaveLength(1);
    expect(boundary.firstElementChild?.tagName).toBe('ARTICLE');
    expect(boundary.firstElementChild?.getAttribute('data-ctfl-scopes')).toBe(
      experience.nodes[0]!.attribution!.roots[0]!.key
    );
  });

  it('makes repeated plans distinct DOM presentations while preserving delivered scope keys', async () => {
    const experience = await plan();
    const container = document.createElement('div');
    container.innerHTML = renderToString(
      <>
        <ServerExperienceRenderer experience={experience} config={config} />
        <ServerExperienceRenderer experience={experience} config={config} />
      </>
    );
    const boundaries = container.querySelectorAll('[data-ctfl-attribution]');
    expect(boundaries).toHaveLength(2);
    expect(boundaries[0]).not.toBe(boundaries[1]);
    expect(boundaries[0]!.querySelector('article')?.getAttribute('data-ctfl-scopes')).toBe(
      boundaries[1]!.querySelector('article')?.getAttribute('data-ctfl-scopes')
    );
  });

  it('uses an empty inner boundary so a plan without attribution cannot borrow an ancestor', async () => {
    const outer = await plan();
    const inner = await plan(false);
    const container = document.createElement('div');
    container.innerHTML = renderToString(
      <ServerExperienceRenderer
        experience={outer}
        config={{
          components: {
            probe: () => <ServerExperienceRenderer experience={inner} config={config} />,
          },
        }}
      />
    );
    const boundaries = container.querySelectorAll('[data-ctfl-attribution]');
    expect(boundaries).toHaveLength(2);
    expect(JSON.parse(boundaries[1]!.getAttribute('data-ctfl-attribution')!)).toEqual({
      scopes: {},
    });
    expect(boundaries[1]!.querySelector('[data-ctfl-scopes]')).toBeNull();
  });

  it('binds a customer-owned table root without a layout-changing wrapper', async () => {
    const experience = await plan();
    const tableConfig: Config = {
      components: {
        probe: (props: HTMLAttributes<HTMLElement>) => (
          <tr {...props}>
            <td>row</td>
          </tr>
        ),
      },
    };
    const html = renderToString(
      <table>
        <ServerExperienceRenderer
          experience={experience}
          config={tableConfig}
          as="tbody"
          rootProps={{ style: { display: 'table-row-group' } }}
        />
      </table>
    );
    expect(html).toMatch(/^<table><tbody /);
    const container = document.createElement('div');
    container.innerHTML = html;
    expect(container.querySelector('tbody')?.hasAttribute('data-ctfl-attribution')).toBe(true);
    expect(container.querySelector('tbody')?.style.display).toBe('table-row-group');
    expect(container.querySelector('tr')?.getAttribute('data-ctfl-scopes')).toBe(
      experience.nodes[0]!.attribution!.roots[0]!.key
    );
    expect(html).not.toContain('<div');
  });

  it('hydrates the same attributes and changes supplied plans without stale scopes', async () => {
    const experience = await plan();
    const plain = await plan(false);
    const html = renderToString(
      <ServerExperienceRenderer experience={experience} config={config} as="section" />
    );
    const container = document.createElement('div');
    document.body.append(container);
    container.innerHTML = html;
    const recoverable = vi.fn();
    await act(async () =>
      roots.push(
        hydrateRoot(
          container,
          <ClientExperienceRenderer experience={experience} config={config} as="section" />,
          { onRecoverableError: recoverable }
        )
      )
    );
    expect(recoverable).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe(html);
    await act(async () =>
      roots[0]!.render(<ClientExperienceRenderer experience={plain} config={config} as="section" />)
    );
    expect(container.querySelector('[data-ctfl-scopes]')).toBeNull();
    expect(
      JSON.parse(container.querySelector('section')!.getAttribute('data-ctfl-attribution')!)
    ).toEqual({ scopes: {} });
  });

  it('provides ready-to-use manual data and releases roots when the callback is removed', async () => {
    const experience = await plan();
    const calls: Array<Parameters<OnExperienceNodeRoot>[0]> = [];
    const cleanup = vi.fn();
    const onNodeRoot: OnExperienceNodeRoot = (value) => {
      calls.push(value);
      return cleanup;
    };
    function Bound({ experienceRoot }: { experienceRoot: ExperienceRootBinding }) {
      return <article {...experienceRoot.getRootProps()}>manual</article>;
    }
    const boundConfig: Config = {
      components: { probe: { component: Bound, root: { prop: 'experienceRoot' } } },
    };
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    await act(async () =>
      root.render(
        <ClientExperienceRenderer
          experience={experience}
          config={boundConfig}
          trackViews={false}
          onNodeRoot={onNodeRoot}
        />
      )
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]!.element).toBe(container.querySelector('article'));
    expect(calls[0]!.attribution).toBe(experience.nodes[0]!.attribution);
    expect(container.querySelector('article')?.getAttribute('data-ctfl-scopes')).toBe(
      experience.nodes[0]!.attribution!.roots[0]!.key
    );
    expect(container.querySelector('article')?.getAttribute('data-ctfl-track-views')).toBe('false');
    expect(calls[0]!.data).toBe(experience.nodes[0]!.attribution!.roots.at(-1));
    await act(async () =>
      root.render(
        <ClientExperienceRenderer experience={experience} config={boundConfig} trackViews={false} />
      )
    );
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(1);
  });
});
