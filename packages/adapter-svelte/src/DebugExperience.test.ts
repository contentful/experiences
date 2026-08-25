import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import type {
  ExperienceDiagnostic,
  PortableRenderNode,
  PortableRenderPlan,
} from '@contentful/experiences-sdk-core';

import DebugExperience from './DebugExperience.svelte';

const emptyPlan: PortableRenderPlan = {
  nodes: [],
  viewports: [],
  fallbackViewportIndex: 0,
  diagnostics: [],
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

    const one: PortableRenderPlan = {
      viewports: [],
      nodes: [node('button')],
      fallbackViewportIndex: 0,
      diagnostics: [],
    };
    const { container } = render(DebugExperience, { props: { experience: one } });
    expect(container.innerHTML).toContain('Experience debug — 1 top-level node');
  });

  it('names experienceTemplate nodes in the summary', () => {
    const plan: PortableRenderPlan = {
      viewports: [],
      nodes: [templateNode('page')],
      fallbackViewportIndex: 0,
      diagnostics: [],
    };
    const { container } = render(DebugExperience, { props: { experience: plan } });
    expect(container.innerHTML).toContain('experience template: page');
  });

  it('omits the experience-template summary for a composite experience', () => {
    const plan: PortableRenderPlan = {
      viewports: [],
      nodes: [node('button'), node('text')],
      fallbackViewportIndex: 0,
      diagnostics: [],
    };
    const { container } = render(DebugExperience, { props: { experience: plan } });
    expect(container.innerHTML).toContain('Experience debug — 2 top-level nodes');
    expect(container.innerHTML).not.toContain('experience template');
  });

  it('dumps the plan as pretty JSON', () => {
    const plan: PortableRenderPlan = {
      viewports: [],
      nodes: [node('button', { label: 'Go' })],
      fallbackViewportIndex: 0,
      diagnostics: [],
    };
    const { container } = render(DebugExperience, { props: { experience: plan } });
    expect(container.innerHTML).toContain('registration');
    expect(container.innerHTML).toContain('button');
    expect(container.innerHTML).toContain('Go');
  });

  it('degrades a circular reference to a placeholder instead of throwing', () => {
    const n = node('button');
    n.props.resolved = { self: n.props };
    const plan: PortableRenderPlan = {
      viewports: [],
      nodes: [n],
      fallbackViewportIndex: 0,
      diagnostics: [],
    };

    expect(() => render(DebugExperience, { props: { experience: plan } })).not.toThrow();
    const { container } = render(DebugExperience, { props: { experience: plan } });
    expect(container.innerHTML).toContain('[Circular]');
  });
});

describe('DebugExperience.svelte — errors prop', () => {
  const warning: ExperienceDiagnostic = {
    severity: 'warning',
    code: 'component-not-registered',
    message: 'No component registered for id "hero".',
    context: { componentId: 'hero' },
  };
  const error: ExperienceDiagnostic = {
    severity: 'error',
    code: 'component-render-error',
    message: 'Component "card" threw while rendering: boom.',
    context: { componentId: 'card' },
  };

  it('stays collapsed and renders no error list when errors is empty or omitted', () => {
    const { container } = render(DebugExperience, { props: { experience: emptyPlan } });
    expect((container.querySelector('details') as HTMLDetailsElement).open).toBe(false);
    expect(container.querySelector('[data-experiences-debug-errors]')).toBeNull();
  });

  it('auto-expands even without defaultOpen when there are errors', () => {
    const { container } = render(DebugExperience, {
      props: { experience: emptyPlan, errors: [warning] },
    });
    expect((container.querySelector('details') as HTMLDetailsElement).open).toBe(true);
  });

  it('renders a diagnostic list above the JSON dump', () => {
    const { container } = render(DebugExperience, {
      props: { experience: emptyPlan, errors: [warning, error] },
    });
    expect(container.querySelector('[data-experiences-debug-errors]')).not.toBeNull();
    expect(
      container.querySelector('[data-experiences-debug-error-code="component-not-registered"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-experiences-debug-error-code="component-render-error"]')
    ).not.toBeNull();
    expect(container.innerHTML).toContain('No component registered for id "hero".');
    expect(container.innerHTML).toContain('Component "card" threw while rendering: boom.');
    expect(container.innerHTML.indexOf('data-experiences-debug-errors')).toBeLessThan(
      container.innerHTML.indexOf('<pre')
    );
  });
});
