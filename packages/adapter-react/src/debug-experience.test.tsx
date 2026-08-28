import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import type { PortableRenderNode, PortableRenderPlan } from '@contentful/experiences-sdk-core';

import { DebugExperience } from './debug-experience';

const emptyPlan: PortableRenderPlan = {
  nodes: [],
  viewports: [],
  fallbackViewportIndex: 0,
  metadata: {},
  debug: false,
};

function node(id: string, content: Record<string, unknown> = {}): PortableRenderNode {
  return {
    registration: { kind: 'component', id },
    props: { content, design: {}, designRaw: {} },
    slots: {},
  };
}

function templateNode(id: string): PortableRenderNode {
  return {
    registration: { kind: 'experienceTemplate', id },
    props: { content: {}, design: {}, designRaw: {} },
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

    const one: PortableRenderPlan = {
      viewports: [],
      nodes: [node('button')],
      fallbackViewportIndex: 0,
      metadata: {},
      debug: false,
    };
    expect(renderToStaticMarkup(<DebugExperience experience={one} />)).toContain(
      'Experience debug — 1 top-level node'
    );
  });

  it('names experienceTemplate nodes in the summary', () => {
    const plan: PortableRenderPlan = {
      viewports: [],
      nodes: [templateNode('page')],
      fallbackViewportIndex: 0,
      metadata: {},
      debug: false,
    };
    expect(renderToStaticMarkup(<DebugExperience experience={plan} />)).toContain(
      'experience template: page'
    );
  });

  it('omits the experience-template summary for a composite experience', () => {
    const plan: PortableRenderPlan = {
      viewports: [],
      nodes: [node('button'), node('text')],
      fallbackViewportIndex: 0,
      metadata: {},
      debug: false,
    };
    const html = renderToStaticMarkup(<DebugExperience experience={plan} />);
    expect(html).toContain('Experience debug — 2 top-level nodes');
    expect(html).not.toContain('experience template');
  });

  it('dumps the plan as pretty JSON', () => {
    const plan: PortableRenderPlan = {
      viewports: [],
      nodes: [node('button', { label: 'Go' })],
      fallbackViewportIndex: 0,
      metadata: {},
      debug: false,
    };
    const html = renderToStaticMarkup(<DebugExperience experience={plan} />);
    expect(html).toContain('registration');
    expect(html).toContain('button');
    expect(html).toContain('Go');
  });

  it('degrades a circular reference to a placeholder instead of throwing', () => {
    const n = node('button');
    // A customer's resolveData could stash a self-referential object on props.
    n.props.resolved = { self: n.props };
    const plan: PortableRenderPlan = {
      viewports: [],
      nodes: [n],
      fallbackViewportIndex: 0,
      metadata: {},
      debug: false,
    };

    expect(() => renderToStaticMarkup(<DebugExperience experience={plan} />)).not.toThrow();
    expect(renderToStaticMarkup(<DebugExperience experience={plan} />)).toContain('[Circular]');
  });
});
