/*
 * `injectContentfulComponent().attribution` under `@angular/platform-server`,
 * with no DOM. Angular has one renderer for client and server, so this pins
 * that the attribution survives the server path and that an unusable map still
 * renders.
 *
 * Runs under vitest.ssr.config.ts (environment: node).
 */

import { Component, InjectionToken, inject, provideZonelessChangeDetection } from '@angular/core';
import { type BootstrapContext, bootstrapApplication } from '@angular/platform-browser';
import { provideServerRendering, renderApplication } from '@angular/platform-server';
import { describe, expect, it } from 'vitest';

import {
  type ComponentNode,
  type PortableRenderPlan,
  resolveExperience,
} from '@contentful/experiences-sdk-core';

import { ServerExperienceRendererComponent } from './server-experience-renderer.component.js';
import { AttributionProbeFixture } from './test-fixtures/attribution-probe.fixture.js';
import type { Config } from './types.js';

const node: ComponentNode = {
  id: 'n',
  component: {
    sys: {
      type: 'ResourceLink',
      linkType: 'Contentful:Component',
      urn: 'crn:contentful:::experience:spaces/$self/environments/$self/components/probe',
    },
  },
};
const config: Config = { components: { probe: AttributionProbeFixture } };

const sourceMap = {
  version: 1,
  variants: [{ type: 'personalization', id: 'default' }],
  spaces: [],
  environments: [],
  locales: [],
  entries: [],
  assets: [],
  layers: [
    { kind: 'Experience', id: 'exp-a', variants: [0] },
    { kind: 'Component', id: 'probe' },
  ],
  dataAssemblies: [],
  nodes: { n: { layers: [1, 0], scope: 0, contentProperties: [] } },
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

async function renderToHtml(plan: PortableRenderPlan): Promise<string> {
  const bootstrap = (context: BootstrapContext) =>
    bootstrapApplication(
      RootComponent,
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

  return renderApplication(bootstrap, { document: DOCUMENT });
}

describe('attribution during server rendering (no DOM)', () => {
  it('renders the node attribution into the server HTML', async () => {
    const plan = await resolveExperience({ nodes: [node] }, config, { sourceMap });

    const html = await renderToHtml(plan);

    expect(html).toContain('>exp-a</span>');
    // The exact value the plan carries, so the browser hydrates the same thing.
    expect(html).toContain(
      JSON.stringify(plan.nodes[0]!.attribution).replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    );
  });

  it('still renders, with no attribution, for an unusable map', async () => {
    const plan = await resolveExperience({ nodes: [node] }, config, {
      sourceMap: { ...sourceMap, version: 99 } as never,
    });

    const html = await renderToHtml(plan);

    expect(html).toMatch(/<span[^>]*data-scopes[^>]*>\s*<\/span>/);
    expect(html).not.toContain('exp-a');
  });
});
