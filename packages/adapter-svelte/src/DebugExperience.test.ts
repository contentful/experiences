import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import type { PortableRenderNode, PortableRenderPlan } from '@contentful/experiences-sdk-core';

import DebugExperience from './DebugExperience.svelte';

const emptyPlan: PortableRenderPlan = { nodes: [], viewports: [] };

function node(componentTypeId: string, content: Record<string, unknown> = {}): PortableRenderNode {
  return {
    registration: { componentTypeId },
    props: { content, design: {} },
    slots: {},
  };
}

describe('DebugExperience.svelte', () => {
  it('renders a collapsible details panel with the debug marker, collapsed by default', () => {
    const { container } = render(DebugExperience, { props: { experience: emptyPlan } });
    const details = container.querySelector('details[data-experiences-debug]');
    expect(details).not.toBeNull();
    expect((details as HTMLDetailsElement).open).toBe(false);
  });

  it('expands on first paint when defaultOpen is set', () => {
    const { container } = render(DebugExperience, {
      props: { experience: emptyPlan, defaultOpen: true },
    });
    expect((container.querySelector('details') as HTMLDetailsElement).open).toBe(true);
  });

  it('summarizes the node count, pluralizing correctly', () => {
    const { container: zero } = render(DebugExperience, { props: { experience: emptyPlan } });
    expect(zero.innerHTML).toContain('Experience debug — 0 top-level nodes');

    const one: PortableRenderPlan = { viewports: [], nodes: [node('button')] };
    const { container } = render(DebugExperience, { props: { experience: one } });
    expect(container.innerHTML).toContain('Experience debug — 1 top-level node');
  });

  it('names the template in the summary when present', () => {
    const plan: PortableRenderPlan = {
      viewports: [],
      nodes: [],
      template: { templateId: 'page', props: { content: {}, design: {} } },
    };
    const { container } = render(DebugExperience, { props: { experience: plan } });
    expect(container.innerHTML).toContain('template: page');
  });

  it('dumps the plan as pretty JSON', () => {
    const plan: PortableRenderPlan = {
      viewports: [],
      nodes: [node('button', { label: 'Go' })],
    };
    const { container } = render(DebugExperience, { props: { experience: plan } });
    expect(container.innerHTML).toContain('componentTypeId');
    expect(container.innerHTML).toContain('button');
    expect(container.innerHTML).toContain('Go');
  });

  it('degrades a circular reference to a placeholder instead of throwing', () => {
    const n = node('button');
    n.props.resolved = { self: n.props };
    const plan: PortableRenderPlan = { viewports: [], nodes: [n] };

    expect(() => render(DebugExperience, { props: { experience: plan } })).not.toThrow();
    const { container } = render(DebugExperience, { props: { experience: plan } });
    expect(container.innerHTML).toContain('[Circular]');
  });
});
