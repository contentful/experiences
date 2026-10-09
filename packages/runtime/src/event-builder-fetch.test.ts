import { describe, expect, it, vi } from 'vitest';
import {
  fetchExperience,
  type ContentfulViewDeliveryClient,
  type PersonalizationOptions,
} from '@contentful/experiences-client';
import EventBuilder from './event-builder.js';

describe('Runtime EventBuilder with Client fetchExperience', () => {
  it('forwards one built page event through the typed XDA personalization extension', async () => {
    const builder = new EventBuilder({
      channel: 'server',
      library: { name: '@contentful/experiences-runtime', version: '0.0.0' },
    });
    const event = builder.buildPageView({
      locale: 'de-DE',
      properties: { path: '/home', url: '/home' },
    });
    const personalization = {
      profileId: 'profile-1',
      events: [event],
    } satisfies PersonalizationOptions;
    const getWithOverrides = vi.fn().mockResolvedValue({ nodes: [] });
    const get = vi.fn();
    const client = {
      experience: { get, getWithOverrides },
    } as unknown as ContentfulViewDeliveryClient;

    const plan = await fetchExperience(
      {
        spaceId: 'space',
        environmentId: 'master',
        experienceId: 'experience',
        locale: 'de-DE',
        personalization,
      },
      { client },
      { config: { components: {} } }
    );

    expect(get).not.toHaveBeenCalled();
    expect(getWithOverrides).toHaveBeenCalledExactlyOnceWith('space', 'master', 'experience', {
      locale: 'de-DE',
      extensions: { personalization },
    });
    expect(getWithOverrides.mock.calls[0]?.[3].extensions.personalization.events[0]).toBe(event);
    expect(plan.nodes).toEqual([]);
  });
});
