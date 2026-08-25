import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import type {
  ExperienceDiagnostic,
  PortableRenderNode,
  PortableRenderPlan,
} from '@contentful/experiences-sdk-core';

import { DebugExperience } from './debug-experience';

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
      diagnostics: [],
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
      diagnostics: [],
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
      diagnostics: [],
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
      diagnostics: [],
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
      diagnostics: [],
    };

    expect(() => renderToStaticMarkup(<DebugExperience experience={plan} />)).not.toThrow();
    expect(renderToStaticMarkup(<DebugExperience experience={plan} />)).toContain('[Circular]');
  });
});

describe('DebugExperience — errors prop', () => {
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
    const html = renderToStaticMarkup(<DebugExperience experience={emptyPlan} />);
    expect(html).not.toContain('open=""');
    expect(html).not.toContain('data-experiences-debug-errors');
  });

  it('auto-expands even without defaultOpen when there are errors', () => {
    const html = renderToStaticMarkup(
      <DebugExperience experience={emptyPlan} errors={[warning]} />
    );
    expect(html).toContain('open=""');
  });

  it('renders a diagnostic list above the JSON dump', () => {
    const html = renderToStaticMarkup(
      <DebugExperience experience={emptyPlan} errors={[warning, error]} />
    );
    expect(html).toContain('data-experiences-debug-errors');
    expect(html).toContain('data-experiences-debug-error-code="component-not-registered"');
    expect(html).toContain('data-experiences-debug-error-code="component-render-error"');
    expect(html).toContain('No component registered for id &quot;hero&quot;.');
    expect(html).toContain('Component &quot;card&quot; threw while rendering: boom.');
    // The error list appears before the JSON dump's <pre> tag.
    expect(html.indexOf('data-experiences-debug-errors')).toBeLessThan(html.indexOf('<pre'));
  });
});
