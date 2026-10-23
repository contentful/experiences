/*
 * True SSR coverage of a resolve-time diagnostic reaching the debug panel —
 * renders through `renderApplication` (no DOM at all, see
 * nodes-renderer.ssr.test.ts for the load-bearing bootstrap-context details),
 * not `TestBed`/`detectChanges()` (the jsdom-mounted path every other
 * coverage test in this package uses). `token-unresolved` is the trigger:
 * it's produced by `resolveExperience` itself, so it's already baked into
 * `plan.diagnostics` before any renderer sees it — proving the panel
 * surfaces a resolve-time diagnostic under a real server render, not just a
 * jsdom-mounted test harness.
 *
 * Runs under vitest.ssr.config.ts (environment: node).
 */

import { Component, InjectionToken, inject, provideZonelessChangeDetection } from '@angular/core';
import { type BootstrapContext, bootstrapApplication } from '@angular/platform-browser';
import { provideServerRendering, renderApplication } from '@angular/platform-server';
import { describe, expect, it, vi } from 'vitest';

import {
  type ComponentNode,
  type ExperiencePayload,
  type PortableRenderPlan,
  resolveExperience,
} from '@contentful/experiences-sdk-core';

import { ServerExperienceRendererComponent } from './server-experience-renderer.component.js';
import { ButtonFixture } from './test-fixtures/button.fixture.js';
import type { Config } from './types.js';

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

const PLAN = new InjectionToken<PortableRenderPlan>('test.plan');
const CONFIG = new InjectionToken<Config>('test.config');

@Component({
  selector: 'cf-root-debug',
  imports: [ServerExperienceRendererComponent],
  template: `<cf-server-experience [experience]="plan" [config]="config" [debug]="true" />`,
})
class RootComponentWithDebug {
  protected readonly plan = inject(PLAN);
  protected readonly config = inject(CONFIG);
}

describe('debug panel — true SSR coverage of a resolve-time diagnostic', () => {
  it('token-unresolved reaches the debug panel under renderApplication', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const payload: ExperiencePayload = {
        nodes: [
          componentNode('button', {
            id: 'b',
            designProperties: { cfColor: { type: 'DesignToken', value: 'color.brand' } },
          }),
        ],
      };
      const config: Config = {
        components: { button: ButtonFixture },
        resolveToken: () => undefined,
      };
      const plan = await resolveExperience(payload, config);

      const bootstrap = (context: BootstrapContext) =>
        bootstrapApplication(
          RootComponentWithDebug,
          {
            providers: [
              provideServerRendering(),
              provideZonelessChangeDetection(),
              { provide: PLAN, useValue: plan },
              { provide: CONFIG, useValue: config },
            ],
          },
          context
        );

      const html = await renderApplication(bootstrap, {
        document:
          '<!doctype html><html><head></head><body><cf-root-debug></cf-root-debug></body></html>',
      });

      expect(html).toContain('data-experiences-debug-errors');
      expect(html).toContain('color.brand');
      expect(html).toContain('resolveToken');
    } finally {
      warn.mockRestore();
    }
  });
});

describe('debug panel — Delivery diagnostic privacy', () => {
  it('omits private upstream details with debug enabled', async () => {
    const deliveryDiagnostics = Object.freeze([
      { fieldPath: 'private/upstream/field', message: 'private upstream message' },
    ]);
    const plan = Object.freeze<PortableRenderPlan>({
      nodes: [
        {
          registration: { kind: 'component', id: 'button' },
          props: {
            content: { label: 'Useful content', deliveryDiagnostics: 'customer content field' },
            design: {},
            designRaw: {},
          },
          slots: {},
        },
      ],
      metadata: { source: 'useful metadata' },
      debug: true,
      diagnostics: [new Error('Existing resolver diagnostic')],
      deliveryDiagnostics,
    });
    const config: Config = { components: { button: ButtonFixture } };
    const html = await renderApplication(
      (context: BootstrapContext) =>
        bootstrapApplication(
          RootComponentWithDebug,
          {
            providers: [
              provideServerRendering(),
              provideZonelessChangeDetection(),
              { provide: PLAN, useValue: plan },
              { provide: CONFIG, useValue: config },
            ],
          },
          context
        ),
      {
        document:
          '<!doctype html><html><head></head><body><cf-root-debug></cf-root-debug></body></html>',
      }
    );

    expect(html).toContain('data-experiences-debug');
    expect(html).toContain('data-experiences-debug-errors');
    expect(html).toContain('Existing resolver diagnostic');
    expect(html).toContain('Useful content');
    expect(html).toContain('useful metadata');
    expect(html).toContain('customer content field');
    expect(html).not.toContain('private/upstream/field');
    expect(html).not.toContain('private upstream message');
    expect(plan.deliveryDiagnostics).toBe(deliveryDiagnostics);
    expect(plan.deliveryDiagnostics).toEqual([
      { fieldPath: 'private/upstream/field', message: 'private upstream message' },
    ]);
  });
});
