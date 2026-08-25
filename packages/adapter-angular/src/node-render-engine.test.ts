/*
 * `component-render-error` isolation — creation-time throws caught by the
 * try/catch in `NodeRenderEngine.createView`. Uses the same jsdom harness as
 * server-renderer.test.ts (`render()` from render-harness.ts), which exercises
 * `ServerExperienceRendererComponent` through `TestBed.createComponent` — the
 * same code path Angular runs for CSR. See nodes-renderer.ssr.test.ts for the
 * real `@angular/platform-server` proof that this also holds under true SSR
 * (there is only one `createComponent` call site in this adapter — no
 * SSR-specific renderer to diverge, unlike React and Svelte).
 */
import { Component, Input, signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';

import {
  type ComponentNode,
  type ExperiencePayload,
  resolveExperience,
} from '@contentful/experiences-sdk-core';

import { render } from './test-fixtures/render-harness.js';
import { BrokenFixture } from './test-fixtures/broken.fixture.js';
import { ButtonFixture } from './test-fixtures/button.fixture.js';
import type { Config } from './types.js';

const VIEWPORTS = [{ id: 'desktop', query: '*', displayName: 'Desktop', previewSize: '100%' }];

function componentNode(typeId: string, rest: Omit<ComponentNode, 'component'> = {}): ComponentNode {
  return {
    component: {
      sys: {
        type: 'ResourceLink',
        linkType: 'Contentful:Component',
        urn: `crn:contentful:::experience:spaces/$self/environments/$self/components/${typeId}`,
      },
    },
    ...rest,
  };
}

@Component({
  selector: 'cf-custom-error-fixture',
  template: `<div [attr.data-custom-error]="componentIdValue()"></div>`,
})
class CustomErrorFixture {
  protected readonly componentIdValue = signal('');
  @Input({ required: true }) set componentId(value: string) {
    this.componentIdValue.set(value);
  }
}

describe('NodeRenderEngine — component-render-error isolation', () => {
  it('isolates a throwing component — sibling still renders, diagnostic recorded', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const payload: ExperiencePayload = {
        viewports: VIEWPORTS,
        nodes: [
          componentNode('broken', { id: 'b' }),
          componentNode('contentful-button', { id: 'f', contentProperties: { label: 'sibling' } }),
        ],
      };
      const config: Config = {
        components: { broken: BrokenFixture, 'contentful-button': ButtonFixture },
      };
      const plan = await resolveExperience(payload, config);

      const { html } = render(plan, { config, debug: true });

      expect(html).toContain('sibling');
      expect(html).toContain('data-experiences-render-error="broken"');
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('boom'));
    } finally {
      warn.mockRestore();
    }
  });

  it('renders nothing from the default fallback when debug is off, but still warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const payload: ExperiencePayload = {
        viewports: VIEWPORTS,
        nodes: [componentNode('broken', { id: 'b' })],
      };
      const config: Config = { components: { broken: BrokenFixture } };
      const plan = await resolveExperience(payload, config);

      const { html } = render(plan, { config });

      expect(html).not.toContain('data-experiences-render-error');
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('boom'));
    } finally {
      warn.mockRestore();
    }
  });

  it('honors a custom renderError override', async () => {
    const payload: ExperiencePayload = {
      viewports: VIEWPORTS,
      nodes: [componentNode('broken', { id: 'b' })],
    };
    const config: Config = { components: { broken: BrokenFixture } };
    const plan = await resolveExperience(payload, config);

    const { html } = render(plan, { config, renderError: CustomErrorFixture });

    expect(html).toContain('data-custom-error="broken"');
  });
});
