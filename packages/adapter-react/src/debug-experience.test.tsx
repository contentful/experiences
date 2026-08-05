import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import type { PortableRenderNode, PortableRenderPlan } from '@contentful/experiences-sdk-core';

import { DebugExperience } from './debug-experience';

const emptyPlan: PortableRenderPlan = { nodes: [], viewports: [] };

function node(componentTypeId: string, content: Record<string, unknown> = {}): PortableRenderNode {
  return {
    registration: { componentTypeId },
    props: { content, design: {}, designRaw: {} },
    slots: {},
  };
}

describe('DebugExperience', () => {
  it('renders a collapsible details panel with the debug marker, collapsed by default', () => {
    const html = renderToStaticMarkup(<DebugExperience experience={emptyPlan} />);
    expect(html).toContain('data-experiences-debug');
    expect(html).toContain('<details');
    expect(html).not.toContain('open=""');
  });

  it('expands on first paint when defaultOpen is set', () => {
    const html = renderToStaticMarkup(<DebugExperience experience={emptyPlan} defaultOpen />);
    expect(html).toContain('open=""');
  });

  it('summarizes the node count, pluralizing correctly', () => {
    const zero = renderToStaticMarkup(<DebugExperience experience={emptyPlan} />);
    expect(zero).toContain('Experience debug — 0 top-level nodes');

    const one: PortableRenderPlan = { viewports: [], nodes: [node('button')] };
    expect(renderToStaticMarkup(<DebugExperience experience={one} />)).toContain(
      'Experience debug — 1 top-level node'
    );
  });

  it('names the template in the summary when present', () => {
    const plan: PortableRenderPlan = {
      viewports: [],
      nodes: [],
      template: { templateId: 'page', props: { content: {}, design: {}, designRaw: {} } },
    };
    expect(renderToStaticMarkup(<DebugExperience experience={plan} />)).toContain('template: page');
  });

  it('dumps the plan as pretty JSON', () => {
    const plan: PortableRenderPlan = {
      viewports: [],
      nodes: [node('button', { label: 'Go' })],
    };
    const html = renderToStaticMarkup(<DebugExperience experience={plan} />);
    expect(html).toContain('componentTypeId');
    expect(html).toContain('button');
    expect(html).toContain('Go');
  });

  it('degrades a circular reference to a placeholder instead of throwing', () => {
    const n = node('button');
    // A customer's resolveData could stash a self-referential object on props.
    n.props.resolved = { self: n.props };
    const plan: PortableRenderPlan = { viewports: [], nodes: [n] };

    expect(() => renderToStaticMarkup(<DebugExperience experience={plan} />)).not.toThrow();
    expect(renderToStaticMarkup(<DebugExperience experience={plan} />)).toContain('[Circular]');
  });
});
