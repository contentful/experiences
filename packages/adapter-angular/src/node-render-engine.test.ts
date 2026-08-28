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
import { Component, Input, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import {
  type ComponentNode,
  type ExperiencePayload,
  resolveExperience,
} from '@contentful/experiences-sdk-core';

import { render } from './test-fixtures/render-harness.js';
import { BrokenFixture } from './test-fixtures/broken.fixture.js';
import { ButtonFixture } from './test-fixtures/button.fixture.js';
import { ServerExperienceRendererComponent } from './server-experience-renderer.component.js';
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

describe('NodeRenderEngine — render-time diagnostics dedupe across re-syncs', () => {
  it('reports a persistently-unregistered component only once, not once per sync', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const payload: ExperiencePayload = {
        viewports: VIEWPORTS,
        nodes: [componentNode('missing', { id: 'm' })],
      };
      const config: Config = { components: {} };
      const plan = await resolveExperience(payload, config);

      // Unlike the render-harness helper (one detectChanges call, then a
      // detached snapshot), this needs two syncs against the *same* live
      // fixture — `collect()` re-reads `unit.resolution()` on every sync
      // regardless of whether anything about this node changed, and it's
      // exactly that re-read (not a real new occurrence) `reportDiagnostics`
      // must not re-report. Already correct today (`lastDiagnostics`
      // guard in NodeRenderEngine) — this pins it against a future
      // regression, matching the equivalent React/Svelte fixes.
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
      const fixture = TestBed.createComponent(ServerExperienceRendererComponent);
      fixture.componentRef.setInput('experience', plan);
      fixture.componentRef.setInput('config', config);
      fixture.componentRef.setInput('debug', true);

      fixture.detectChanges();
      fixture.detectChanges();

      const html = (fixture.nativeElement as HTMLElement).innerHTML;
      const matches = html.match(/No component registered for id "missing"/g);
      expect(matches).toHaveLength(1);
    } finally {
      warn.mockRestore();
    }
  });
});

describe('NodeRenderEngine — a resolution-time throw on a later sync', () => {
  it('isolates a node whose design-token resolution starts throwing on the second sync — sibling unaffected, fallback shown, recovers if resolution succeeds again', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // `selectResolvedDesign` only calls `resolveToken` at all when the
      // active viewport differs from the fallback one — with a single
      // viewport it always returns the (already fallback-resolved) design
      // as-is. A second viewport, with `initialViewportId` below pointing at
      // it, is what actually exercises the adapter's own resolveToken path.
      const twoViewports = [
        ...VIEWPORTS,
        { id: 'mobile', query: '<576px', displayName: 'Mobile', previewSize: '100%' },
      ];
      const payload: ExperiencePayload = {
        viewports: twoViewports,
        nodes: [
          componentNode('contentful-button', {
            id: 'b',
            designProperties: { cfBackgroundColor: { type: 'DesignToken', value: 'color.brand' } },
          }),
          componentNode('contentful-button', {
            id: 'f',
            contentProperties: { label: 'sibling' },
          }),
        ],
      };
      // Deliberately no `resolveToken` passed to resolveExperience (core) —
      // the raw DesignToken passes through to `designRaw`, so the adapter's
      // *own* `config.resolveToken` (below) is what actually resolves it,
      // exactly as it does live per active viewport.
      const config: Config = {
        components: { 'contentful-button': ButtonFixture },
      };
      const plan = await resolveExperience(payload, config);

      let calls = 0;
      const failingConfig: Config = {
        ...config,
        resolveToken: () => {
          calls += 1;
          if (calls > 1) throw new Error('token service unavailable');
          return '#fff';
        },
      };

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
      const fixture = TestBed.createComponent(ServerExperienceRendererComponent);
      fixture.componentRef.setInput('experience', plan);
      fixture.componentRef.setInput('config', failingConfig);
      fixture.componentRef.setInput('debug', true);
      fixture.componentRef.setInput('initialViewportId', 'mobile');

      // First sync: resolveToken's first call succeeds — both nodes mount
      // cleanly.
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).innerHTML).not.toContain(
        'data-experiences-render-error'
      );

      // Second sync, nothing about the node itself changed, but resolveToken
      // now throws on read — this must isolate to the "b" node, not crash
      // collect()'s whole loop.
      fixture.componentRef.setInput('config', { ...failingConfig });
      fixture.detectChanges();

      const html = (fixture.nativeElement as HTMLElement).innerHTML;
      expect(html).toContain('sibling');
      expect(html).toContain('data-experiences-render-error="contentful-button"');
      expect(html).toContain('token service unavailable');
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('token service unavailable'));

      // Recovery: resolveToken stops throwing again (a fresh function, reset
      // counter) — the fallback must come back down and the real component
      // must remount, not stay stuck as the fallback forever.
      let recoveredCalls = 0;
      fixture.componentRef.setInput('config', {
        ...config,
        resolveToken: () => {
          recoveredCalls += 1;
          return '#000';
        },
      });
      fixture.detectChanges();

      const recoveredHtml = (fixture.nativeElement as HTMLElement).innerHTML;
      expect(recoveredHtml).not.toContain('data-experiences-render-error');
      expect(recoveredHtml).toContain('sibling');
    } finally {
      warn.mockRestore();
    }
  });

  it('does not catch a throw from inside the customer component itself on a later pass (documented residual gap)', async () => {
    // Pins the limitation stated in createView's doc comment: a throw from
    // the *customer* component's own internals on a later CD pass never
    // touches adapter code, so it can't be caught here — only a throw the
    // adapter's own resolveNode/resolveDesign computation produces can be.
    // This is Angular's own default error handling taking over, not ours;
    // wrapped so it doesn't crash the test runner itself.
    // A plain instance counter doesn't work here: under zoneless change
    // detection, a component with nothing signal-tracked in its template is
    // simply never re-checked by a later `detectChanges()`, even an
    // explicit one — there's no "always re-run every template on every
    // call" fallback the way zone.js gave you. A module-level signal, read
    // from the template, is what actually marks this view dirty when
    // mutated from outside.
    const trigger = signal(0);
    @Component({
      selector: 'cf-later-throw-fixture',
      template: `{{ value() }}`,
    })
    class LaterThrowFixture {
      protected value(): string {
        if (trigger() > 0) throw new Error('customer internal boom');
        return 'ok';
      }
    }

    const payload: ExperiencePayload = {
      viewports: VIEWPORTS,
      nodes: [componentNode('later-throw', { id: 'b' })],
    };
    const config: Config = { components: { 'later-throw': LaterThrowFixture } };
    const plan = await resolveExperience(payload, config);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(ServerExperienceRendererComponent);
    fixture.componentRef.setInput('experience', plan);
    fixture.componentRef.setInput('config', config);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).innerHTML).toContain('ok');

    // Flip the signal LaterThrowFixture's own template reads — this marks
    // its view dirty from entirely outside our adapter, simulating "some
    // later CD pass, for reasons the adapter has no visibility into or
    // control over." The resulting throw is Angular's own unguarded
    // propagation, not anything our adapter's diagnostic stream sees.
    trigger.set(1);
    expect(() => fixture.detectChanges()).toThrow(/customer internal boom/);
  });
});
