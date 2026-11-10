import { describe, expect, it, vi } from 'vitest';

import { fetchExperience } from '@contentful/experiences-client';
import EventBuilder from '../../events/event-builder.js';

import {
  attributionPayload as payload,
  attributionSourceMap as sourceMap,
} from '../fixtures/attribution.js';

function fakeClient() {
  const getWithOverrides = vi.fn().mockResolvedValue({ ...payload, extensions: { sourceMap } });
  return { experience: { getWithOverrides } } as never;
}

const options = { spaceId: 'space-1', environmentId: 'master', experienceId: 'exp-1' };
const builder = new EventBuilder({ channel: 'web', library: { name: 'test', version: '1.0.0' } });

describe('fetchExperience → plan → EventBuilder', () => {
  it('passes a fetched Fragment scope directly into the interaction builder', async () => {
    const client = fakeClient();
    const plan = await fetchExperience(
      { ...options, extensions: { sourceMap: {} } },
      { client },
      { config: { components: {} } }
    );
    const fragment = plan.nodes[0]!.attribution!.scopes.find(
      (scope) => scope.entityKind === 'ExperienceFragment'
    )!;
    const { key: _key, ...args } = fragment;

    expect(builder.buildClick(args)).toMatchObject({
      type: 'exo_node_click',
      entityId: 'frag-1',
      parentExperienceId: 'exp-1',
      parentVariantId: 'default',
      variantId: 'variant-b',
    });
  });
});
