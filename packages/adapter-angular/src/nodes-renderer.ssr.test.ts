/*
 * Port of adapter-svelte/src/nodes-renderer.ssr.test.ts.
 *
 * Runs in `node`, not jsdom (see vitest.ssr.config.ts) — the point is that a
 * plan renders to HTML with no DOM at all, so `injectActiveViewport`'s
 * `matchMedia` path and `afterNextRender` must both stay untouched on the
 * server.
 *
 * Angular's SSR entry point is `renderApplication`, which takes a *bootstrap
 * function*, not a component. Two things about that contract are load-bearing
 * and cost a full afternoon each when missed:
 *
 * - The `BootstrapContext` handed to the bootstrap function must be threaded
 *   into `bootstrapApplication(...)` as its third argument, or every render
 *   fails with NG0401 ("Missing Platform").
 * - `provideZonelessChangeDetection()` is required. Without it — and without
 *   importing zone.js, which this package deliberately does not do — Angular
 *   throws NG0908 while constructing `NgZone`.
 *
 * The plan and config reach the root component through `InjectionToken`s in the
 * bootstrap providers rather than module-level mutable state, so tests cannot
 * leak into each other.
 */

import { Component, InjectionToken, inject, provideZonelessChangeDetection } from '@angular/core';
import { type BootstrapContext, bootstrapApplication } from '@angular/platform-browser';
import { provideServerRendering, renderApplication } from '@angular/platform-server';
import { describe, expect, it } from 'vitest';

import {
  type ComponentNode,
  type ExperiencePayload,
  type ExperienceTemplateNode,
  type PortableRenderPlan,
  resolveExperience,
} from '@contentful/experiences-sdk-core';

import { ServerExperienceRendererComponent } from './server-experience-renderer.component.js';
import { BrokenFixture } from './test-fixtures/broken.fixture.js';
import { ButtonFixture } from './test-fixtures/button.fixture.js';
import { ContainerFixture } from './test-fixtures/container.fixture.js';
import { ExperienceTemplateFixture } from './test-fixtures/experience-template.fixture.js';
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

function experienceTemplateNode(
  typeId: string,
  rest: Omit<ExperienceTemplateNode, 'experienceTemplate'> = {}
): ExperienceTemplateNode {
  return {
    experienceTemplate: {
      sys: {
        type: 'ResourceLink',
        linkType: 'Contentful:ExperienceTemplate',
        urn: `crn:contentful:::experience:spaces/$self/environments/$self/experienceTemplates/${typeId}`,
      },
    },
    ...rest,
  };
}

const button = (label: string) =>
  componentNode('contentful-button', { id: `btn-${label}`, contentProperties: { label } });

const config: Config = {
  components: {
    'contentful-container': ContainerFixture,
    'contentful-button': ButtonFixture,
  },
  experienceTemplates: { page: ExperienceTemplateFixture },
};

const PLAN = new InjectionToken<PortableRenderPlan>('test.plan');
const CONFIG = new InjectionToken<Config>('test.config');

@Component({
  selector: 'cf-root',
  imports: [ServerExperienceRendererComponent],
  template: `<cf-server-experience [experience]="plan" [config]="config" />`,
})
class RootComponent {
  protected readonly plan = inject(PLAN);
  protected readonly config = inject(CONFIG);
}

const DOCUMENT = '<!doctype html><html><head></head><body><cf-root></cf-root></body></html>';

async function renderToHtml(payload: ExperiencePayload, cfg: Config = config): Promise<string> {
  const plan = await resolveExperience(payload, cfg);

  const bootstrap = (context: BootstrapContext) =>
    bootstrapApplication(
      RootComponent,
      {
        providers: [
          provideServerRendering(),
          provideZonelessChangeDetection(),
          { provide: PLAN, useValue: plan },
          { provide: CONFIG, useValue: cfg },
        ],
      },
      context
    );

  return renderApplication(bootstrap, { document: DOCUMENT });
}

describe('server rendering (no DOM)', () => {
  it('renders slot children inside their parent', async () => {
    const html = await renderToHtml({
      viewports: VIEWPORTS,
      nodes: [
        componentNode('contentful-container', {
          id: 'c',
          slots: { children: [button('Get started')] },
        }),
      ],
    });

    expect(html).toContain('Get started');
    expect(html.indexOf('<div')).toBeLessThan(html.indexOf('Get started'));
  });

  /*
   * Dispatch is anchor-only, so the server response must not contain a wrapper
   * element either — the pre-hydration paint has to lay out the same tree the
   * hydrated one does, or the first frame reflows once Angular boots.
   */
  it('emits no adapter elements in the server response', async () => {
    const html = await renderToHtml({
      viewports: VIEWPORTS,
      nodes: [
        componentNode('contentful-container', {
          id: 'c',
          slots: { children: [button('Get started')] },
        }),
      ],
    });

    for (const selector of ['cf-nodes', 'cf-node', 'cf-component-node', 'cf-node-host']) {
      expect(html).not.toContain(`<${selector}`);
    }
    // Pairs with the absence assertions above, which pass on an empty string.
    expect(html).toContain('Get started');
  });

  it("renders a coded experience template's named content slot", async () => {
    const html = await renderToHtml({
      viewports: VIEWPORTS,
      nodes: [
        experienceTemplateNode('page', {
          id: 'tpl',
          contentProperties: { title: 'Coded page' },
          slots: { content: [button('Read the blog')] },
        }),
      ],
    });

    expect(html).toContain('data-experience-template="page"');
    expect(html).toContain('data-title="Coded page"');
    expect(html).toContain('Read the blog');
    // The slot content is inside <main>, not merely somewhere on the page.
    expect(html.split('<main')[1]).toContain('Read the blog');
  });

  it('renders a deeply nested tree', async () => {
    const html = await renderToHtml({
      viewports: VIEWPORTS,
      nodes: [
        experienceTemplateNode('page', {
          id: 'tpl',
          slots: {
            content: [
              componentNode('contentful-container', {
                id: 'c',
                slots: { children: [button('Deep')] },
              }),
            ],
          },
        }),
      ],
    });

    expect(html).toContain('Deep');
  });

  it('renders a composite experience unwrapped', async () => {
    const html = await renderToHtml({
      viewports: VIEWPORTS,
      nodes: [button('Alone')],
    });

    expect(html).toContain('Alone');
    expect(html).not.toContain('<main');
  });
});

/*
 * Unlike React and Svelte — which each need a separate SSR-specific note
 * because their server renderers don't run the class-error-boundary /
 * `<svelte:boundary>` machinery at all (see the equivalent test files in
 * those adapters) — Angular has no parallel server renderer. `renderApplication`
 * bootstraps the exact same `ServerExperienceRendererComponent` tree and runs
 * the exact same `NodeRenderEngine.createView` try/catch. Proven here, not
 * just asserted: this is the one adapter where SSR and CSR error handling are
 * verifiably the same code path, not just "should be."
 */
describe('server rendering (no DOM) — component-render-error', () => {
  const brokenConfig: Config = {
    components: { broken: BrokenFixture, 'contentful-button': ButtonFixture },
  };

  it('isolates the failing node under real SSR — sibling still renders, no crash', async () => {
    const html = await renderToHtml(
      {
        viewports: VIEWPORTS,
        nodes: [componentNode('broken', { id: 'b' }), button('sibling')],
      },
      brokenConfig
    );

    expect(html).toContain('sibling');
  });

  it('emits the debug fallback markup server-side when debug is on', async () => {
    const plan = await resolveExperience(
      { viewports: VIEWPORTS, nodes: [componentNode('broken', { id: 'b' })] },
      brokenConfig
    );

    const bootstrap = (context: BootstrapContext) =>
      bootstrapApplication(
        RootComponentWithDebug,
        {
          providers: [
            provideServerRendering(),
            provideZonelessChangeDetection(),
            { provide: PLAN, useValue: plan },
            { provide: CONFIG, useValue: brokenConfig },
          ],
        },
        context
      );

    const html = await renderApplication(bootstrap, {
      document:
        '<!doctype html><html><head></head><body><cf-root-debug></cf-root-debug></body></html>',
    });
    expect(html).toContain('data-experiences-render-error="broken"');
  });
});

@Component({
  selector: 'cf-root-debug',
  imports: [ServerExperienceRendererComponent],
  template: `<cf-server-experience [experience]="plan" [config]="config" [debug]="true" />`,
})
class RootComponentWithDebug {
  protected readonly plan = inject(PLAN);
  protected readonly config = inject(CONFIG);
}
