import { describe, expect, it, vi } from 'vitest';
import {
  fetchExperience,
  createClient,
  type PersonalizationOptions,
} from '@contentful/experiences-client';
import EventBuilder from './event-builder.js';

describe('Runtime EventBuilder with Client fetchExperience', () => {
  it('serializes built page and identify events for XDA without mutating them', async () => {
    const builder = new EventBuilder({
      channel: 'server',
      library: { name: '@contentful/experiences-runtime', version: '0.0.0' },
    });
    const event = builder.buildPageView({
      locale: 'de-DE',
      properties: { path: '/home', url: '/home' },
    });
    const identify = builder.buildIdentify({
      userId: 'visitor',
      traits: { identified: true },
    });
    const originalEvents = globalThis.structuredClone([event, identify]);
    const personalization = {
      profileId: 'profile-1',
      events: [event, identify],
    } satisfies PersonalizationOptions;
    const fetchMock = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new globalThis.Response(
        JSON.stringify({
          sys: {
            id: 'experience',
            type: 'Experience',
            space: { sys: { type: 'Link', linkType: 'Space', id: 'space' } },
            environment: { sys: { type: 'Link', linkType: 'Environment', id: 'master' } },
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            createdBy: { sys: { type: 'Link', linkType: 'User', id: 'user' } },
            updatedBy: { sys: { type: 'Link', linkType: 'User', id: 'user' } },
            experienceTemplate: {
              sys: {
                type: 'ResourceLink',
                linkType: 'Contentful:ExperienceTemplate',
                urn: 'urn:template',
              },
            },
          },
          nodes: [],
          errors: [],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );
    const client = createClient({ accessToken: 'test-token', fetch: fetchMock });

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

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/experiences/experience');
    expect(init?.method).toBe('POST');
    const body = JSON.parse(String(init?.body));
    expect(body.extensions.personalization.profileId).toBe('profile-1');
    const [sentPage, sentIdentify] = body.extensions.personalization.events;
    expect(sentPage).toMatchObject({
      type: 'page',
      messageId: event.messageId,
      properties: { path: '/home', url: '/home', title: '' },
      context: { locale: 'de-DE' },
    });
    expect(sentIdentify).toMatchObject({
      type: 'identify',
      messageId: identify.messageId,
      userId: 'visitor',
      traits: { identified: true },
    });
    for (const sent of [sentPage, sentIdentify]) {
      expect(sent.context).not.toHaveProperty('gdpr');
      expect(sent.context.page).not.toHaveProperty('title');
    }
    expect([event, identify]).toEqual(originalEvents);
    expect(plan.nodes).toEqual([]);
  });
});
