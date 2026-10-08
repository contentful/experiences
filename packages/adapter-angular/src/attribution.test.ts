/*
 * `injectContentfulComponent().attribution`. NodeRenderEngine reuses a unit by
 * `nodeId` and calls `unit.node.set(node)`, so a plan update that reuses an id
 * must replace the attribution on the same live instance.
 */
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import {
  type ComponentNode,
  type ExperiencePayload,
  resolveExperience,
} from '@contentful/experiences-sdk-core';

import { ServerExperienceRendererComponent } from './server-experience-renderer.component.js';
import { AttributionProbeFixture } from './test-fixtures/attribution-probe.fixture.js';
import { AttributionTemplateProbeFixture } from './test-fixtures/attribution-template-probe.fixture.js';
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
const payload: ExperiencePayload = { nodes: [node] };
const config: Config = { components: { probe: AttributionProbeFixture } };

function sourceMap(experienceId: string) {
  return {
    version: 1,
    variants: [{ type: 'personalization', id: 'default' }],
    spaces: [],
    environments: [],
    locales: [],
    entries: [],
    assets: [],
    layers: [
      { kind: 'Experience', id: experienceId, variants: [0] },
      { kind: 'Component', id: 'probe' },
    ],
    dataAssemblies: [],
    nodes: { n: { layers: [1, 0], scope: 0, contentProperties: [] } },
  };
}

describe('injectContentfulComponent().attribution', () => {
  it('exposes the node attribution and replaces it when a plan reuses the node id', async () => {
    const first = await resolveExperience(payload, config, { sourceMap: sourceMap('exp-a') });
    const second = await resolveExperience(payload, config, { sourceMap: sourceMap('exp-b') });
    const cleared = await resolveExperience(payload, config);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(ServerExperienceRendererComponent);
    fixture.componentRef.setInput('config', config);
    const text = () =>
      (fixture.nativeElement as HTMLElement).querySelector('[data-scopes]')?.textContent?.trim();

    fixture.componentRef.setInput('experience', first);
    fixture.detectChanges();
    expect(text()).toBe('exp-a');
    // Exactly what the plan carries: the same value React and Svelte are held to.
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('[data-scopes]')
        ?.getAttribute('data-json')
    ).toBe(JSON.stringify(first.nodes[0]!.attribution));
    const element = (fixture.nativeElement as HTMLElement).querySelector('[data-scopes]');

    fixture.componentRef.setInput('experience', second);
    fixture.detectChanges();
    expect(text()).toBe('exp-b');
    // Same live instance: the id was reused, not re-created.
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-scopes]')).toBe(element);

    fixture.componentRef.setInput('experience', cleared);
    fixture.detectChanges();
    expect(text()).toBe('');
  });
});

describe('injectContentfulExperienceTemplate().attribution', () => {
  const templateConfig: Config = {
    components: {},
    experienceTemplates: { page: AttributionTemplateProbeFixture },
  };
  const templatePayload = {
    nodes: [
      {
        id: 'tpl',
        experienceTemplate: {
          sys: {
            type: 'ResourceLink',
            linkType: 'Contentful:ExperienceTemplate',
            urn: 'crn:contentful:::experience:spaces/$self/environments/$self/experienceTemplates/page',
          },
        },
      },
    ],
  } as ExperiencePayload;
  const templateMap = (experienceId: string) => ({
    version: 1,
    variants: [{ type: 'personalization', id: 'default' }],
    spaces: [],
    environments: [],
    locales: [],
    entries: [],
    assets: [],
    layers: [
      { kind: 'Experience', id: experienceId, variants: [0] },
      { kind: 'ExperienceTemplate', id: 'page' },
    ],
    dataAssemblies: [],
    nodes: { tpl: { layers: [1, 0], scope: 0, contentProperties: [] } },
  });

  it('exposes the template node attribution and replaces it when a plan reuses the node id', async () => {
    const first = await resolveExperience(templatePayload, templateConfig, {
      sourceMap: templateMap('exp-a'),
    });
    const second = await resolveExperience(templatePayload, templateConfig, {
      sourceMap: templateMap('exp-b'),
    });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(ServerExperienceRendererComponent);
    fixture.componentRef.setInput('config', templateConfig);
    const text = () =>
      (fixture.nativeElement as HTMLElement)
        .querySelector('[data-template-scopes]')
        ?.textContent?.trim();

    fixture.componentRef.setInput('experience', first);
    fixture.detectChanges();
    expect(text()).toBe('exp-a');

    fixture.componentRef.setInput('experience', second);
    fixture.detectChanges();
    expect(text()).toBe('exp-b');
  });
});

describe('an unusable source map', () => {
  const good = {
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
  // A wrong version, a missing table, and a node whose chain is nonsense.
  const unusable = [
    { ...good, version: 99 },
    { ...good, layers: undefined },
    { ...good, nodes: { n: { layers: 'nope', scope: 0 } } },
  ];

  it.each(unusable.map((map, i) => [i, map] as const))(
    'still renders the component, with no attribution (case %i)',
    async (_i, map) => {
      const plan = await resolveExperience(payload, config, { sourceMap: map as never });

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
      const fixture = TestBed.createComponent(ServerExperienceRendererComponent);
      fixture.componentRef.setInput('config', config);
      fixture.componentRef.setInput('experience', plan);
      fixture.detectChanges();

      const probe = (fixture.nativeElement as HTMLElement).querySelector('[data-scopes]');
      expect(probe).not.toBeNull();
      expect(probe?.textContent?.trim()).toBe('');
      expect(probe?.getAttribute('data-json')).toBe('null');
      expect(plan.diagnostics).toEqual([]);
    }
  );
});
