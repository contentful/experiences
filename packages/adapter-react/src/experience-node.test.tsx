import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { PortableRenderNode, PortableRenderPlan } from '@contentful/experiences-sdk-core';

import { useContentfulComponent, useContentfulExperienceTemplate, useExperience } from './context';
import { createExperienceNode, ExperienceNode, resolveNodeProps } from './primitives';
import { ServerExperienceRenderer } from './server-renderer';
import { defineComponent, type Config } from './types';
import { useDesignValues } from './use-design-values';

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

const plan = (nodes: PortableRenderNode[]): PortableRenderPlan => ({
  nodes,
  metadata: {},
  debug: false,
  diagnostics: [],
});

function resolve(node: PortableRenderNode, config: Config) {
  const resolved = resolveNodeProps(node, config);
  if (resolved.status !== 'resolved')
    throw new Error(`expected ${node.registration.id} to resolve`);
  return resolved;
}

/** Reads every SDK hook, so markup differs if any provider is missing. */
function Card({ title, children }: { title?: string; children?: ReactNode }) {
  const { color } = useDesignValues<{ color?: string }>();
  const contentful = useContentfulComponent();
  const { metadata } = useExperience();
  return (
    <article data-node={contentful?.nodeId} data-slug={String(metadata.slug)} style={{ color }}>
      {title}
      {children}
    </article>
  );
}

function Page({ content }: { content?: ReactNode }) {
  const template = useContentfulExperienceTemplate();
  return <main data-template={template?.experienceTemplateId}>{content}</main>;
}

const config: Config = {
  components: { card: defineComponent({ component: Card, defaults: { title: 'Default' } }) },
  experienceTemplates: { page: Page },
};

const cardNode = planNode(
  'component',
  'card',
  { content: { title: 'Hi' }, design: { color: 'red' } },
  { nodeId: 'c1' }
);
const experience = { debug: false, metadata: { slug: 'home' } };

describe('ExperienceNode', () => {
  it('renders a resolved node exactly as ServerExperienceRenderer does', () => {
    const host = renderToStaticMarkup(
      <ExperienceNode node={resolve(cardNode, config)} experience={experience} />
    );
    const sdk = renderToStaticMarkup(
      <ServerExperienceRenderer
        experience={plan([cardNode])}
        config={config}
        metadata={experience.metadata}
      />
    );

    expect(host).toBe(sdk);
    expect(host).toBe('<article data-node="c1" data-slug="home" style="color:red">Hi</article>');
  });

  it('renders a JSON round-tripped snapshot the same way, looking the component up by id', () => {
    const resolved = resolve(cardNode, config);
    const snapshot = JSON.parse(JSON.stringify(resolved.snapshot));

    const fromSnapshot = renderToStaticMarkup(
      <ExperienceNode node={snapshot} components={config.components} experience={experience} />
    );

    expect(fromSnapshot).toBe(
      renderToStaticMarkup(<ExperienceNode node={resolved} experience={experience} />)
    );
  });

  it('keeps component and status out of the snapshot', () => {
    const { snapshot } = resolve(cardNode, config);

    expect(snapshot).not.toHaveProperty('component');
    expect(snapshot).not.toHaveProperty('status');
    expect(snapshot).toEqual({
      kind: 'component',
      id: 'card',
      nodeId: 'c1',
      props: { title: 'Hi', color: 'red' },
      design: { color: 'red' },
      contentful: {
        componentId: 'card',
        nodeId: 'c1',
        content: { title: 'Hi' },
        design: {},
        resolved: undefined,
        attribution: undefined,
      },
    });
  });

  it('passes extra props and the slots prop through as slot props, slots winning', () => {
    const markup = renderToStaticMarkup(
      <ExperienceNode
        node={resolve(cardNode, config)}
        experience={experience}
        title="from extra prop"
        slots={{ children: <b>slot</b> }}
      />
    );

    expect(markup).toContain('from extra prop<b>slot</b>');
  });

  it('only publishes useExperience() when given an experience', () => {
    expect(() => renderToStaticMarkup(<ExperienceNode node={resolve(cardNode, config)} />)).toThrow(
      /useExperience\(\) must be called inside/
    );
  });

  it('renders an experience template snapshot from experienceTemplates', () => {
    const pageNode = planNode('experienceTemplate', 'page', {}, { nodeId: 't1' });
    const { snapshot } = resolve(pageNode, config);
    const IslandExperienceNode = createExperienceNode({}, config.experienceTemplates);

    const markup = renderToStaticMarkup(
      <IslandExperienceNode node={snapshot} content={<p>body</p>} />
    );

    expect(markup).toBe('<main data-template="page"><p>body</p></main>');
  });
});

describe('createExperienceNode', () => {
  it('binds the registry, so a snapshot renders with no components prop', () => {
    const IslandExperienceNode = createExperienceNode({ card: Card });
    const { snapshot } = resolve(cardNode, config);

    const markup = renderToStaticMarkup(
      <IslandExperienceNode node={snapshot} experience={experience} />
    );

    expect(markup).toBe('<article data-node="c1" data-slug="home" style="color:red">Hi</article>');
  });

  it('throws a clear error when the bound registry is missing the snapshot id', () => {
    const IslandExperienceNode = createExperienceNode({});
    const { snapshot } = resolve(cardNode, config);

    expect(() =>
      renderToStaticMarkup(<IslandExperienceNode node={snapshot} experience={experience} />)
    ).toThrow(/snapshot of component "card" \(node "c1"\) but "card" is not in its components/);
  });
});
