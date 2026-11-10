import { describe, expect, it } from 'vitest';
import { setupPayloadRuntime } from '../runtime.js';
import { profileFixture } from '../fixtures/profile.js';
import { payloadFixture, payloadScope } from '../fixtures/payload.js';

// Real Runtime/Core resolution joins the Node producer's prepared body and identity.
describe('Node handoff resolution integration', () => {
  it.each([
    { changes: [] },
    {
      changes: [
        {
          type: 'Variable' as const,
          key: 'banner',
          value: false,
          meta: { experienceId: 'experiment', variantIndex: 0 },
        },
      ],
    },
  ])('carries returned flag snapshots through private handoffs (%j)', async ({ changes }) => {
    const { request, options, fetch } = setupPayloadRuntime({}, { consent: true });
    const response = payloadFixture();
    response.extensions!.personalization!.changes = changes;
    fetch.mockResolvedValueOnce(response);
    const { handoff } = await request.fetchExperienceForHandoff(
      options,
      { config: { components: {} } },
      { routeKey: '/home' }
    );
    expect(handoff.state).toEqual({ profile: profileFixture('xda-profile'), changes });
  });

  it('returns the resolved plan and the exact evaluated events in one private aggregate', async () => {
    const { request, options, fetch, commit } = setupPayloadRuntime(
      { locale: 'en-US' },
      { consent: true, profile: { id: 'incoming' } }
    );
    const { handoff, plan, error } = await request.fetchExperienceForHandoff(
      options,
      { config: { components: {} } },
      { routeKey: '/home?sort=popular' }
    );

    expect(error).toBeUndefined();
    expect(plan?.personalization?.profile).toEqual(profileFixture('xda-profile'));
    expect(handoff).toEqual({
      ...payloadScope,
      cache: { scope: 'private-request' },
      profileId: 'xda-profile',
      state: { profile: profileFixture('xda-profile') },
      replay: {
        routeKey: '/home?sort=popular',
        locale: 'en-US',
        events: fetch.mock.calls[0]![0].personalization?.events,
      },
    });
    expect(commit).not.toHaveBeenCalled();
  });
});
