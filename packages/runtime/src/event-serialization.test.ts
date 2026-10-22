import { describe, expect, it } from 'vitest';

import { InsightsApiClient } from '@contentful/optimization-api-client';
import { fetchExperience } from '@contentful/experiences-client';

import EventBuilder from './event-builder.js';

const urn = (id: string) =>
  `crn:contentful:::experience:spaces/$self/environments/$self/components/${id}`;

const payload = {
  sys: { id: 'exp-1' },
  nodes: [
    {
      id: 'inner-node',
      component: { sys: { type: 'ResourceLink', linkType: 'Contentful:Component', urn: urn('c') } },
    },
  ],
};

// Experience > outer Fragment > inner Fragment, with a selected Experience variant
// and a baseline (default) inner Fragment.
const sourceMap = {
  version: 1,
  variants: [
    { type: 'personalization', id: 'default' },
    {
      type: 'personalization',
      id: 'root-b',
      optimizationId: 'opt-root',
      variantId: 'root-b',
      variantIndex: 1,
    },
    {
      type: 'personalization',
      id: 'outer-b',
      optimizationId: 'opt-outer',
      variantId: 'outer-b',
      variantIndex: 2,
    },
  ],
  spaces: ['space-1'],
  environments: ['master'],
  locales: ['en-US'],
  entries: [],
  assets: [],
  layers: [
    { kind: 'Experience', id: 'exp-1', variants: [1] },
    { kind: 'ExperienceTemplate', id: 'page' },
    { kind: 'Slot', id: 'content' },
    { kind: 'ExperienceFragment', id: 'outer', variants: [2] },
    { kind: 'ExperienceFragment', id: 'inner', variants: [0] },
    { kind: 'Component', id: 'card' },
  ],
  dataAssemblies: [],
  nodes: { 'inner-node': { layers: [5, 4, 3, 2, 1, 0], scope: 4 } },
};

describe('serialized ExO request bodies', () => {
  it('sends ExperienceFragment with variant and parent attribution through API Client validation', async () => {
    const bodies: { events: Record<string, unknown>[] }[][] = [];
    const api = new InsightsApiClient({
      spaceId: 'space-1',
      environment: 'master',
      fetchOptions: {
        fetchMethod: async (_input, init) => {
          bodies.push(JSON.parse(String(init?.body)));
          return new globalThis.Response('{}', { status: 200 });
        },
      },
    });
    const builder = new EventBuilder({
      channel: 'web',
      library: { name: 'test', version: '1.0.0' },
    });
    const client = {
      experience: { getWithOverrides: async () => ({ ...payload, extensions: { sourceMap } }) },
    } as never;

    const plan = await fetchExperience(
      {
        spaceId: 'space-1',
        environmentId: 'master',
        experienceId: 'exp-1',
        extensions: { sourceMap: {} },
      },
      { client },
      { config: { components: {} } }
    );
    const events = plan.nodes[0]!.attribution!.scopes.flatMap(({ key: _key, ...args }) => [
      builder.buildView({ ...args, viewId: 'v', viewDurationMs: 1000 }),
      builder.buildClick(args),
      builder.buildHover({ ...args, hoverId: 'h', hoverDurationMs: 500 }),
    ]);

    await expect(
      api.sendBatchEvents([{ profile: { id: 'profile-1' }, events }] as never)
    ).resolves.toBe(true);

    // Each scope sends a view, click and hover. Fragments keep their own variant and
    // take the root Experience, not the enclosing Fragment, as parent; Experiences
    // carry no parent fields.
    const root = { parentExperienceId: 'exp-1', parentVariantId: 'root-b' };
    const scopeSummaries = [
      { entityKind: 'Experience', entityId: 'exp-1', variantId: 'root-b' },
      { entityKind: 'ExperienceFragment', entityId: 'outer', variantId: 'outer-b', ...root },
      { entityKind: 'ExperienceFragment', entityId: 'inner', variantId: 'default', ...root },
    ];
    const sent = bodies[0]!.flatMap((batch) => batch.events);
    expect(
      sent.map((e) => ({
        entityKind: e.entityKind,
        entityId: e.entityId,
        variantId: e.variantId,
        parentExperienceId: e.parentExperienceId,
        parentVariantId: e.parentVariantId,
      }))
    ).toEqual(scopeSummaries.flatMap((summary) => [summary, summary, summary]));
  });
});
