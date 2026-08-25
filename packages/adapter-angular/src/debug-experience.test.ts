/*
 * Port of adapter-svelte/src/DebugExperience.test.ts.
 *
 * `DebugExperience` is mounted directly here rather than through the renderer:
 * the parity suite already covers auto-mounting, and driving the component
 * itself is what lets these tests hand it a deliberately circular plan.
 *
 * `<details open>` is a reflected boolean IDL attribute, so `.open` is read off
 * the live element — the property, not the serialized HTML, is the contract.
 */

import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type {
  ExperienceDiagnostic,
  PortableRenderNode,
  PortableRenderPlan,
} from '@contentful/experiences-sdk-core';

import { DebugExperienceComponent } from './debug-experience.component.js';

const VIEWPORTS = [{ id: 'desktop', query: '*', displayName: 'Desktop', previewSize: '100%' }];

function componentNode(id: string, content: Record<string, unknown> = {}): PortableRenderNode {
  return {
    nodeId: id,
    registration: { kind: 'component', id },
    props: { content, design: {}, designRaw: {} },
    slots: {},
  };
}

function experienceTemplateNode(id: string): PortableRenderNode {
  return {
    nodeId: `tpl-${id}`,
    registration: { kind: 'experienceTemplate', id },
    props: { content: {}, design: {}, designRaw: {} },
    slots: {},
  };
}

function plan(nodes: PortableRenderNode[]): PortableRenderPlan {
  return { viewports: VIEWPORTS, fallbackViewportIndex: 0, nodes, diagnostics: [] };
}

interface DebugResult {
  details: HTMLDetailsElement | null;
  text: string;
  html: string;
}

function renderDebug(
  experience: PortableRenderPlan,
  defaultOpen?: boolean,
  errors?: ExperienceDiagnostic[]
): DebugResult {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });

  const fixture = TestBed.createComponent(DebugExperienceComponent);
  fixture.componentRef.setInput('experience', experience);
  if (defaultOpen !== undefined) {
    fixture.componentRef.setInput('defaultOpen', defaultOpen);
  }
  if (errors !== undefined) {
    fixture.componentRef.setInput('errors', errors);
  }
  fixture.detectChanges();

  const host = fixture.nativeElement as HTMLElement;

  return {
    details: host.querySelector<HTMLDetailsElement>('details[data-experiences-debug]'),
    text: host.textContent ?? '',
    html: host.innerHTML,
  };
}

describe('DebugExperience', () => {
  it('renders a collapsed details element by default', () => {
    const { details } = renderDebug(plan([componentNode('button', { label: 'Go' })]));

    expect(details).not.toBeNull();
    expect(details!.open).toBe(false);
  });

  it('renders expanded when defaultOpen is set', () => {
    const { details } = renderDebug(plan([componentNode('button', { label: 'Go' })]), true);

    expect(details).not.toBeNull();
    expect(details!.open).toBe(true);
  });

  it('pluralizes the top-level node count', () => {
    expect(renderDebug(plan([])).text).toContain('Experience debug — 0 top-level nodes');
    expect(renderDebug(plan([componentNode('button')])).text).toContain(
      'Experience debug — 1 top-level node'
    );
  });

  it('names the experience template in the summary', () => {
    const { text } = renderDebug(plan([experienceTemplateNode('page')]));

    expect(text).toContain('experience template: page');
  });

  it('omits the experience template from the summary for a composite experience', () => {
    const { text } = renderDebug(plan([componentNode('a'), componentNode('b')]));

    expect(text).toContain('Experience debug — 2 top-level nodes');
    expect(text).not.toContain('experience template');
  });

  it('pretty-prints the plan', () => {
    const { text } = renderDebug(plan([componentNode('button', { label: 'Go' })]));

    expect(text).toContain('registration');
    expect(text).toContain('button');
    expect(text).toContain('Go');
  });

  it('survives a circular plan', () => {
    const node = componentNode('button', { label: 'Go' });
    node.props.resolved = { self: node.props };

    expect(() => renderDebug(plan([node]))).not.toThrow();
    expect(renderDebug(plan([node])).text).toContain('[Circular]');
  });
});

describe('DebugExperience — errors input', () => {
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
    const { details, html } = renderDebug(plan([]));
    expect(details!.open).toBe(false);
    expect(html).not.toContain('data-experiences-debug-errors');
  });

  it('auto-expands even without defaultOpen when there are errors', () => {
    const { details } = renderDebug(plan([]), undefined, [warning]);
    expect(details!.open).toBe(true);
  });

  it('renders a diagnostic list above the JSON dump', () => {
    const { html } = renderDebug(plan([]), undefined, [warning, error]);
    expect(html).toContain('data-experiences-debug-errors');
    expect(html).toContain('data-experiences-debug-error-code="component-not-registered"');
    expect(html).toContain('data-experiences-debug-error-code="component-render-error"');
    expect(html).toContain('No component registered for id "hero".');
    expect(html).toContain('Component "card" threw while rendering: boom.');
    expect(html.indexOf('data-experiences-debug-errors')).toBeLessThan(html.indexOf('<pre'));
  });
});
