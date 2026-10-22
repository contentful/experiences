import { describe, expect, it, vi } from 'vitest';

import { fetchExperience } from '@contentful/experiences-client';
import EventBuilder from './event-builder.js';

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
    const fragment = plan.nodes[0]!.attribution!.scopes.find(
      (s) => s.entityKind === 'ExperienceFragment'
    )!;
    expect(fragment).toMatchObject({
      entityId: 'frag-1',
      entityKindId: 'hero-component',
      parentExperienceId: 'exp-1',
      parentVariantId: 'default',
      optimizationId: 'opt-1',
      variantId: 'variant-b',
      variantIndex: 1,
      entryIds: ['entry-1'],
    });

    const { key: _key, ...args } = fragment;
    const view = builder.buildView({ ...args, viewId: 'view-1', viewDurationMs: 1000 });
    const click = builder.buildClick(args);
    const hover = builder.buildHover({ ...args, hoverId: 'hover-1', hoverDurationMs: 500 });

    for (const event of [view, click, hover]) {
      expect(event).toMatchObject({ entityId: 'frag-1', variantIndex: 1 });
    }
  });

  it('builds a valid baseline Experience event with default as its own variant and no parent', async () => {
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

    expect(view).toHaveProperty('variantId', 'default');
    expect(view).not.toHaveProperty('parentExperienceId');
    expect(view).not.toHaveProperty('parentVariantId');
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
});
