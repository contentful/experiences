import type { PortableRenderNode } from '@contentful/experiences-sdk-core';
import type { ExperiencePayload } from '@contentful/experiences-sdk-core';
import { resolveExperience } from '@contentful/experiences-sdk-core';
import type { ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Config } from '../registry/types';
import {
  componentNode,
  experienceTemplateNode,
  sysWithExperienceTemplate,
} from '../test/fixtures/payload.js';

import { ComponentError } from '../diagnostics/component-error';
import { MissingComponent } from '../diagnostics/missing-component';
import { ExperienceProvider } from './context';
import { NodesRenderer } from './nodes-renderer';
describe('NodesRenderer', () => {
  it('renders an experienceTemplate node from the experienceTemplates registry', async () => {
    const Item = ({ value }: { value?: string }) => <span>{value}</span>;
    // A template's slots arrive as named props, exactly like a component's —
    // the slot named `content` becomes a `content` prop, not `children`.
    const Template = ({ title, content }: { title?: string; content?: ReactNode[] }) => (
      <main data-experienceTemplate="page" data-title={title}>
        {content}
      </main>
    );
    const cfg: Config = {
      components: { item: Item },
      experienceTemplates: { page: { component: Template, defaults: { title: 'Default Title' } } },
    };
    const tplPayload: ExperiencePayload = {
      sys: sysWithExperienceTemplate('page'),
      nodes: [
        experienceTemplateNode('page', {
          id: 'tpl',
          slots: {
            content: [componentNode('item', { id: 'i', contentProperties: { value: 'inside' } })],
          },
        }),
      ],
    };
    const plan = await resolveExperience(tplPayload, cfg);
    const html = renderToStaticMarkup(
      <ExperienceProvider value={{ debug: false, metadata: {} }}>
        <NodesRenderer
          nodes={plan.nodes}
          config={cfg}
          renderUnknown={MissingComponent}
          renderError={ComponentError}
          onDiagnostic={() => {}}
        />
      </ExperienceProvider>
    );
    expect(html).toContain('data-experienceTemplate="page"');
    expect(html).toContain('data-title="Default Title"');
    expect(html).toContain('<span>inside</span>');
  });

  it('passes slot children as an array a component can map/wrap individually', async () => {
    let received: unknown = null;
    const Container = ({ children }: { children?: ReactNode[] }) => {
      received = children;
      // Wrap each child individually — the whole point of exposing the array.
      return (
        <div data-container>
          {children?.map((child, i) => (
            <div className="wrap" data-index={i} key={i}>
              {child}
            </div>
          ))}
        </div>
      );
    };
    const Item = ({ text }: { text?: string }) => <span>{text}</span>;
    const cfg: Config = { components: { container: Container, item: Item } };
    const plan = await resolveExperience(
      {
        nodes: [
          componentNode('container', {
            id: 'c',
            slots: {
              children: [
                componentNode('item', { id: 'a', contentProperties: { text: 'one' } }),
                componentNode('item', { contentProperties: { text: 'two' } }),
                componentNode('item', { id: 'd', contentProperties: { text: 'three' } }),
              ],
            },
          }),
        ],
      },
      cfg
    );
    const html = renderToStaticMarkup(
      <ExperienceProvider value={{ debug: false, metadata: {} }}>
        <NodesRenderer
          nodes={plan.nodes}
          config={cfg}
          renderUnknown={MissingComponent}
          renderError={ComponentError}
          onDiagnostic={() => {}}
        />
      </ExperienceProvider>
    );

    expect(Array.isArray(received)).toBe(true);
    expect((received as ReactElement[]).map((child) => child.key)).toEqual(['a', '1', 'd']);
    expect(plan.nodes[0]!.slots.children![1]!.nodeId).toBeUndefined();
    // Each child got its own wrapper div — proves per-child control.
    expect(html).toContain('data-index="0"');
    expect(html).toContain('data-index="1"');
    expect(html).toContain('data-index="2"');
    expect(html).toContain('<span>one</span>');
    expect(html).toContain('<span>three</span>');
    expect(html.indexOf('<span>one</span>')).toBeLessThan(html.indexOf('<span>two</span>'));
    expect(html.indexOf('<span>two</span>')).toBeLessThan(html.indexOf('<span>three</span>'));
  });

  it('accepts a bare component for a experienceTemplate', async () => {
    const Item = ({ value }: { value?: string }) => <span>{value}</span>;
    const Tpl = ({ content }: { content?: ReactNode[] }) => <main data-tpl>{content}</main>;
    const cfg: Config = { components: { item: Item }, experienceTemplates: { page: Tpl } };
    const tplPayload: ExperiencePayload = {
      nodes: [
        experienceTemplateNode('page', {
          id: 'tpl',
          slots: {
            content: [componentNode('item', { id: 'i', contentProperties: { value: 'inside' } })],
          },
        }),
      ],
    };
    const plan = await resolveExperience(tplPayload, cfg);
    const html = renderToStaticMarkup(
      <ExperienceProvider value={{ debug: false, metadata: {} }}>
        <NodesRenderer
          nodes={plan.nodes}
          config={cfg}
          renderUnknown={MissingComponent}
          renderError={ComponentError}
          onDiagnostic={() => {}}
        />
      </ExperienceProvider>
    );
    expect(html).toContain('data-tpl');
    expect(html).toContain('<span>inside</span>');
  });
});

it('preserves unregistered template slot children and reports the missing template', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const report = vi.fn();
  const child: PortableRenderNode = {
    registration: { kind: 'component', id: 'item' },
    nodeId: 'i',
    props: { content: { value: 'unwrapped' }, design: {}, designRaw: {} },
    slots: {},
  };
  const node: PortableRenderNode = {
    registration: { kind: 'experienceTemplate', id: 'missing-experienceTemplate' },
    nodeId: 'tpl',
    props: { content: {}, design: {}, designRaw: {} },
    slots: { content: [child] },
  };
  try {
    const html = renderToStaticMarkup(
      <ExperienceProvider value={{ debug: false, metadata: {} }}>
        <NodesRenderer
          nodes={[node]}
          config={{ components: { item: ({ value }: { value: string }) => <span>{value}</span> } }}
          renderUnknown={MissingComponent}
          renderError={ComponentError}
          onDiagnostic={report}
        />
      </ExperienceProvider>
    );
    expect(html).toBe('<span>unwrapped</span>');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('missing-experienceTemplate'));
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(
          'No experience template registered for id "missing-experienceTemplate"'
        ),
      })
    );
  } finally {
    warn.mockRestore();
  }
});
