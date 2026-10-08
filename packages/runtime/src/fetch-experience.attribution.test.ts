/*
 * End to end from a mocked delivery response: fetchExperience → plan →
 * EventBuilder. Only the delivery client is faked. Core is the real one, so this
 * pins that the attribution it resolves is accepted by the event builders and
 * validates against the Optimization ExO event schemas.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  ExoClickEvent as OptimizationExoClickEvent,
  ExoHoverEvent as OptimizationExoHoverEvent,
  ExoViewEvent as OptimizationExoViewEvent,
} from '@contentful/optimization-api-client/api-schemas';
import type { ScopeAttribution } from '@contentful/experiences-sdk-core';

import { fetchExperience } from '@contentful/experiences-client';
import EventBuilder, { type InteractionBuilderArgsBase } from './event-builder.js';

const urn = (id: string) =>
  `crn:contentful:::experience:spaces/$self/environments/$self/components/${id}`;

const payload = {
  sys: { id: 'exp-1' },
  nodes: [
    {
      id: 'hero',
      component: { sys: { type: 'ResourceLink', linkType: 'Contentful:Component', urn: urn('h') } },
    },
  ],
};

// An Experience holding one selected-variant persisted Fragment.
const sourceMap = {
  version: 1,
  variants: [
    { type: 'personalization', id: 'default' },
    {
      type: 'personalization',
      id: 'variant-b',
      optimizationId: 'opt-1',
      variantId: 'variant-b',
      variantIndex: 1,
    },
  ],
  spaces: ['space-1'],
  environments: ['master'],
  locales: ['en-US'],
  entries: [{ space: 0, environment: 0, id: 'entry-1' }],
  assets: [],
  layers: [
    { kind: 'Experience', id: 'exp-1', variants: [0] },
    { kind: 'ExperienceTemplate', id: 'page' },
    { kind: 'Slot', id: 'content' },
    { kind: 'ExperienceFragment', id: 'frag-1', variants: [1] },
    { kind: 'Component', id: 'hero-component' },
  ],
  dataAssemblies: [
    {
      id: 'da',
      parameters: {},
      return: { title: { type: 'entry', entry: 0, field: 'title', locale: 0 } },
    },
  ],
  nodes: {
    hero: {
      layers: [4, 3, 2, 1, 0],
      scope: 3,
      contentProperties: [
        { type: 'dataAssembly', dataAssembly: 0, bindings: { title: ['title'] } },
      ],
    },
  },
};

function fakeClient() {
  const getWithOverrides = vi.fn().mockResolvedValue({ ...payload, extensions: { sourceMap } });
  const get = vi.fn().mockResolvedValue(payload);
  return { client: { experience: { get, getWithOverrides } } as never, get, getWithOverrides };
}

const options = { spaceId: 'space-1', environmentId: 'master', experienceId: 'exp-1' };
const builder = new EventBuilder({ channel: 'web', library: { name: 'test', version: '1.0.0' } });

describe('fetchExperience → plan → EventBuilder', () => {
  it('builds valid view, click and hover events from the resolved Fragment scope', async () => {
    const { client, getWithOverrides } = fakeClient();

    const plan = await fetchExperience(
      { ...options, extensions: { sourceMap: {} } },
      { client },
      { config: { components: {} } }
    );

    expect(getWithOverrides).toHaveBeenCalledOnce();
    const fragment = plan.nodes[0]!.attribution!.scopes.find((s) => s.entityKind === 'Fragment')!;
    expect(fragment).toMatchObject({
      entityId: 'frag-1',
      entityKindId: 'hero-component',
      parentExperienceId: 'exp-1',
      optimizationId: 'opt-1',
      variantId: 'variant-b',
      variantIndex: 1,
      entryIds: ['entry-1'],
    });

    // The key is plan-local and only ever used for lookup: drop it from the event.
    const { key: _key, ...args } = fragment;
    const view = builder.buildView({ ...args, viewId: 'view-1', viewDurationMs: 1000 });
    const click = builder.buildClick(args);
    const hover = builder.buildHover({ ...args, hoverId: 'hover-1', hoverDurationMs: 500 });

    expect(OptimizationExoViewEvent.parse(view)).toEqual(view);
    expect(OptimizationExoClickEvent.parse(click)).toEqual(click);
    expect(OptimizationExoHoverEvent.parse(hover)).toEqual(hover);
    expect(view).toMatchObject({ type: 'exo_node_view', entityId: 'frag-1', variantIndex: 1 });
  });

  it('builds a valid baseline Experience event that omits the optional variant fields', async () => {
    const { client } = fakeClient();
    const plan = await fetchExperience(
      { ...options, extensions: { sourceMap: {} } },
      { client },
      { config: { components: {} } }
    );

    const experience = plan.nodes[0]!.attribution!.scopes.find(
      (s) => s.entityKind === 'Experience'
    )!;
    const { key: _key, ...args } = experience;
    const view = builder.buildView({ ...args, viewId: 'view-1', viewDurationMs: 1000 });

    expect(OptimizationExoViewEvent.parse(view)).toEqual(view);
    expect(view).not.toHaveProperty('variantId');
    expect(view).not.toHaveProperty('variantIndex');
    expect(view).not.toHaveProperty('optimizationId');
  });

  it('has no attribution when the fetch did not opt into the source map', async () => {
    const { client, get } = fakeClient();

    const plan = await fetchExperience(options, { client }, { config: { components: {} } });

    expect(get).toHaveBeenCalledOnce();
    expect(plan.attribution).toBeUndefined();
    expect(plan.nodes[0]).not.toHaveProperty('attribution');
  });

  it('keeps ScopeAttribution structurally assignable to the event builder args', () => {
    // Compile-time check: core cannot import client, so the two shapes must stay compatible.
    const scope: ScopeAttribution = { key: 's0', entityId: 'exp-1', entityKind: 'Experience' };
    const { key: _key, ...args } = scope;
    const asArgs: InteractionBuilderArgsBase = args;

    expect(asArgs.entityId).toBe('exp-1');
  });
});
