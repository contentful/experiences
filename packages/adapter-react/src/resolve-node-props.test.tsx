import { describe, expect, it } from 'vitest';
import { memo } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { NodeAttribution, PortableRenderNode } from '@contentful/experiences-sdk-core';

import { resolveNodeProps } from './custom-renderer';
import { ServerExperienceRenderer } from './server-renderer';
import { defineComponent, type Config } from './types';

function planNode(
  kind: 'component' | 'experienceTemplate',
  id: string,
  props: Partial<PortableRenderNode['props']> = {},
  rest: Partial<PortableRenderNode> = {}
): PortableRenderNode {
  return {
    registration: { kind, id },
    props: { content: {}, design: {}, designRaw: {}, ...props },
    slots: {},
    ...rest,
  };
}

const Noop = () => null;

describe('resolveNodeProps', () => {
  it('merges defaults < design < content < resolveData', () => {
    const config: Config = {
      components: {
        card: defineComponent({
          component: Noop,
          defaults: { a: 'default', b: 'default', c: 'default', d: 'default' },
        }),
      },
    };
    const node = planNode('component', 'card', {
      design: { b: 'design', c: 'design', d: 'design' },
      content: { c: 'content', d: 'content' },
      resolved: { d: 'resolved' },
    });

    const result = resolveNodeProps(node, config);

    expect(result.status).toBe('resolved');
    if (result.status !== 'resolved') return;
    expect(result.props).toEqual({ a: 'default', b: 'design', c: 'content', d: 'resolved' });
  });

  it('does not add slot props; the host renders slots itself', () => {
    const config: Config = { components: { section: Noop, text: Noop } };
    const node = planNode(
      'component',
      'section',
      {},
      { slots: { children: [planNode('component', 'text')] } }
    );

    const result = resolveNodeProps(node, config);

    expect(result.status).toBe('resolved');
    if (result.status !== 'resolved') return;
    expect(result.props).not.toHaveProperty('children');
  });

  it('resolves a bare component and a memo-wrapped component registration', () => {
    const Memoized = memo(Noop);
    const config: Config = { components: { bare: Noop, memoized: Memoized } };

    const bare = resolveNodeProps(planNode('component', 'bare'), config);
    const memoized = resolveNodeProps(planNode('component', 'memoized'), config);

    expect(bare.status === 'resolved' && bare.component).toBe(Noop);
    expect(memoized.status === 'resolved' && memoized.component).toBe(Memoized);
  });

  it('returns the component payload and design for the providers', () => {
    const attribution: NodeAttribution = { scopes: [], roots: [], entryIds: ['entry-1'] };
    const config: Config = { components: { card: Noop } };
    const node = planNode(
      'component',
      'card',
      {
        content: { title: 'Hi' },
        design: { color: 'red' },
        designRaw: { color: { type: 'ManualDesignValue', value: 'red' } },
        resolved: { badge: 'New' },
      },
      { nodeId: 'n1', attribution }
    );

    const result = resolveNodeProps(node, config);

    expect(result).toMatchObject({
      status: 'resolved',
      kind: 'component',
      id: 'card',
      nodeId: 'n1',
      design: { color: 'red' },
      contentful: {
        componentId: 'card',
        nodeId: 'n1',
        content: { title: 'Hi' },
        design: { color: { type: 'ManualDesignValue', value: 'red' } },
        resolved: { badge: 'New' },
        attribution,
      },
    });
  });

  it('looks experience templates up in config.experienceTemplates', () => {
    const Page = () => null;
    const config: Config = {
      components: { page: Noop },
      experienceTemplates: { page: { component: Page, defaults: { title: 'Default' } } },
    };

    const result = resolveNodeProps(
      planNode('experienceTemplate', 'page', { content: { slug: 'home' } }, { nodeId: 't1' }),
      config
    );

    expect(result).toMatchObject({
      status: 'resolved',
      kind: 'experienceTemplate',
      component: Page,
      props: { title: 'Default', slug: 'home' },
      contentful: { experienceTemplateId: 'page', nodeId: 't1', content: { slug: 'home' } },
    });
  });

  it('reports an unregistered component or experience template instead of throwing', () => {
    // A component registered under the same id must not satisfy a template lookup.
    const config: Config = { components: { page: Noop } };

    expect(
      resolveNodeProps(planNode('component', 'missing', {}, { nodeId: 'n2' }), config)
    ).toEqual({
      status: 'unregistered',
      kind: 'component',
      id: 'missing',
      nodeId: 'n2',
    });
    expect(resolveNodeProps(planNode('experienceTemplate', 'page'), config)).toEqual({
      status: 'unregistered',
      kind: 'experienceTemplate',
      id: 'page',
      nodeId: undefined,
    });
  });

  it('gives a host-rendered node the same markup as ServerExperienceRenderer', () => {
    function Card({ title, color, badge }: { title: string; color: string; badge: string }) {
      return (
        <article style={{ color }}>
          {title} {badge}
        </article>
      );
    }
    const config: Config = {
      components: { card: defineComponent({ component: Card, defaults: { badge: 'Featured' } }) },
    };
    const node = planNode('component', 'card', {
      content: { title: 'Hi' },
      design: { color: 'red' },
    });

    const result = resolveNodeProps(node, config);
    if (result.status !== 'resolved') throw new Error('expected a resolved node');
    const Component = result.component;
    const hostMarkup = renderToStaticMarkup(<Component {...result.props} />);
    const sdkMarkup = renderToStaticMarkup(
      <ServerExperienceRenderer
        experience={{ nodes: [node], metadata: {}, debug: false, diagnostics: [] }}
        config={config}
      />
    );

    expect(hostMarkup).toBe(sdkMarkup);
  });
});
