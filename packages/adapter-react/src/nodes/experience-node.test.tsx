import type { PortableRenderNode, PortableRenderPlan } from '@contentful/experiences-sdk-core';
import { resolveExperience } from '@contentful/experiences-sdk-core';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { useDesignValues } from '../hooks/use-design-values';
import type { Config } from '../registry/types';
import {
  useContentfulComponent,
  useContentfulExperienceTemplate,
  useExperience,
} from '../rendering/context';
import { ServerExperienceRenderer } from '../rendering/server-renderer';
import { componentNode, experienceTemplateNode, m } from '../test/fixtures/payload.js';
import { minimalSourceMap } from '../test/fixtures/source-map.js';

import { createExperienceNode, ExperienceNode, resolveNodeProps } from '../custom-renderer';
import { defineComponent } from '../registry/types';

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
  it("wraps resolved node markup in ServerExperienceRenderer's plan boundary", () => {
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

    expect(sdk).toBe(
      `<div data-ctfl-attribution="{&quot;scopes&quot;:{}}" style="display:contents">${host}</div>`
    );
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
    const BoundNode = createExperienceNode({}, config.experienceTemplates);

    const markup = renderToStaticMarkup(<BoundNode node={snapshot} content={<p>body</p>} />);

    expect(markup).toBe('<main data-template="page"><p>body</p></main>');
  });
});

describe('createExperienceNode', () => {
  it('binds the registry, so a snapshot renders with no components prop', () => {
    const BoundNode = createExperienceNode({ card: Card });
    const { snapshot } = resolve(cardNode, config);

    const markup = renderToStaticMarkup(<BoundNode node={snapshot} experience={experience} />);

    expect(markup).toBe('<article data-node="c1" data-slug="home" style="color:red">Hi</article>');
  });

  it('throws a clear error when the bound registry is missing the snapshot id', () => {
    const BoundNode = createExperienceNode({});
    const { snapshot } = resolve(cardNode, config);

    expect(() =>
      renderToStaticMarkup(<BoundNode node={snapshot} experience={experience} />)
    ).toThrow(/snapshot of component "card" \(node "c1"\) but "card" is not in its components/);
  });
});

describe('ExperienceNode providers and final props', () => {
  it('does NOT spread experience/contentful as props onto bare components', async () => {
    let receivedKeys: string[] = [];
    const Probe = (props: Record<string, unknown>) => {
      receivedKeys = Object.keys(props);
      return null;
    };
    const cfg: Config = { components: { probe: Probe } };
    const plan = await resolveExperience(
      {
        nodes: [componentNode('probe', { id: 'p', contentProperties: { text: 'hi' } })],
      },
      cfg
    );
    renderToStaticMarkup(<ExperienceNode node={resolve(plan.nodes[0]!, cfg)} />);
    expect(receivedKeys).toContain('text');
    expect(receivedKeys).not.toContain('experience');
    expect(receivedKeys).not.toContain('contentful');
  });

  it('exposes the raw Contentful payload via useContentfulComponent()', async () => {
    let captured: Record<string, unknown> | null = null;
    let received: Record<string, unknown> = {};
    const Capture = (props: Record<string, unknown>) => {
      captured = useContentfulComponent() as unknown as Record<string, unknown>;
      received = props;
      return null;
    };
    const cfg: Config = {
      components: { button: { component: Capture, resolveData: () => ({ enriched: 'yes' }) } },
    };
    const plan = await resolveExperience(
      {
        nodes: [
          componentNode('button', {
            id: 'btn-1',
            contentProperties: { label: 'Buy now' },
            designProperties: { cfPadding: m('40px') },
          }),
        ],
      },
      cfg
    );
    renderToStaticMarkup(<ExperienceNode node={resolve(plan.nodes[0]!, cfg)} />);

    expect(captured).toEqual({
      componentId: 'button',
      nodeId: 'btn-1',
      content: { label: 'Buy now' },
      design: { cfPadding: m('40px') }, // raw design property, NOT scalar
      resolved: { enriched: 'yes' },
    });
    expect(received).toMatchObject({ label: 'Buy now', cfPadding: '40px', enriched: 'yes' });
  });

  it('exposes node attribution via useContentfulComponent(), as plain serializable data', async () => {
    let captured: Record<string, unknown> | null = null;
    const Capture = () => {
      captured = useContentfulComponent() as unknown as Record<string, unknown>;
      return null;
    };
    const cfg: Config = { components: { button: Capture } };
    const plan = await resolveExperience({ nodes: [componentNode('button', { id: 'n' })] }, cfg, {
      sourceMap: minimalSourceMap({ leaf: { kind: 'Component', id: 'button' } }),
    });
    renderToStaticMarkup(<ExperienceNode node={resolve(plan.nodes[0]!, cfg)} />);

    const attribution = captured!.attribution as { scopes: Array<{ entityId: string }> };
    expect(attribution.scopes.map((s) => s.entityId)).toEqual(['exp-a']);
    // Exactly what the plan carries: the same value Svelte and Angular are held to.
    expect(attribution).toEqual(plan.nodes[0]!.attribution);
    // The provider value crosses the RSC boundary, so it must survive JSON.
    expect(JSON.parse(JSON.stringify(attribution))).toEqual(attribution);
  });

  it('has no attribution when the plan carries no source map', async () => {
    let captured: Record<string, unknown> | null = null;
    const Capture = () => {
      captured = useContentfulComponent() as unknown as Record<string, unknown>;
      return null;
    };
    const cfg: Config = { components: { button: Capture } };
    const plan = await resolveExperience({ nodes: [componentNode('button', { id: 'n' })] }, cfg);
    renderToStaticMarkup(<ExperienceNode node={resolve(plan.nodes[0]!, cfg)} />);

    expect(captured!.attribution).toBeUndefined();
  });

  it('exposes experienceTemplateId/content/design/resolved via useContentfulExperienceTemplate()', async () => {
    let captured: Record<string, unknown> | null = null;
    let received: Record<string, unknown> = {};
    const CaptureTpl = (props: Record<string, unknown>) => {
      captured = useContentfulExperienceTemplate() as unknown as Record<string, unknown>;
      received = props;
      return <main>{props.content as ReactNode[]}</main>;
    };
    const Item = () => null;
    const cfg: Config = {
      components: { item: Item },
      experienceTemplates: { page: { component: CaptureTpl, defaults: { title: 'Default' } } },
    };
    const plan = await resolveExperience(
      {
        nodes: [
          experienceTemplateNode('page', {
            id: 'tpl',
            contentProperties: { heading: 'Hello' },
            designProperties: { cfBackground: m('#111827') },
            slots: { content: [componentNode('item', { id: 'i' })] },
          }),
        ],
      },
      cfg,
      {
        sourceMap: minimalSourceMap({
          node: 'tpl',
          leaf: { kind: 'ExperienceTemplate', id: 'page' },
        }),
      }
    );
    renderToStaticMarkup(<ExperienceNode node={resolve(plan.nodes[0]!, cfg)} />);

    expect(captured).toEqual({
      experienceTemplateId: 'page',
      // A template is an ordinary node, so it carries its payload `id` too.
      nodeId: 'tpl',
      content: { heading: 'Hello' },
      design: { cfBackground: m('#111827') },
      resolved: undefined,
      attribution: plan.nodes[0]!.attribution,
    });
    expect(
      (captured!.attribution as { scopes: Array<{ entityId: string }> }).scopes.map(
        (s) => s.entityId
      )
    ).toEqual(['exp-a']);
    expect(received).toHaveProperty('cfBackground', '#111827');
  });
});

it('constructs a custom error fallback with the actual component and node identity', () => {
  function Broken(): never {
    throw new Error('boom');
  }
  let received: { componentId: string; nodeId?: string } | undefined;
  const CustomError = (props: { componentId: string; nodeId?: string }) => {
    received = props;
    return <div data-custom-error={props.componentId} />;
  };
  const markup = renderToStaticMarkup(
    <ExperienceNode
      node={resolve(planNode('component', 'broken', {}, { nodeId: 'b' }), {
        components: { broken: Broken },
      })}
      experience={{ debug: false, metadata: {} }}
      renderError={CustomError}
    />
  );
  expect(markup).toContain('data-custom-error="broken"');
  expect(received).toMatchObject({ componentId: 'broken', nodeId: 'b' });
});
