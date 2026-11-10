import { describe, expect, it, vi } from 'vitest';
import type { ExperiencePayload } from '@contentful/experiences-sdk-core';
import type { OptimizationEventStreamEvent } from '@contentful/experiences-runtime';
import { setupPayloadRuntime as setup } from '../test/runtime.js';
import { payloadFixture as payload } from '../test/fixtures/payload.js';
import { deferred } from '../test/deferred.js';

const resolver = { config: { components: {} } };
const route = { routeKey: '/' };

describe('Node request content guards', () => {
  it.each([false, true])(
    'drops native event intent before building under preview=%s',
    async (isPreview) => {
      const onEventBlocked = vi.fn();
      const { sdk, fetch, commit } = setup({ locale: 'en-US', onEventBlocked }, { consent: true });
      const build = vi.spyOn(sdk.eventBuilder, 'buildTrack');
      const hook = vi.fn((event: OptimizationEventStreamEvent) => event);
      sdk.interceptors.event.add(hook);
      const request = sdk.forRequest({ isPreview, consent: false, profile: { id: 'incoming' } });
      await request.fetchExperience(
        {
          experienceId: 'experience',
          personalization: { events: [{ type: 'track', event: 'blocked' }] },
        },
        resolver
      );
      expect(fetch.mock.calls[0]![0].personalization).toEqual(
        isPreview ? undefined : { profileId: 'incoming', events: [] }
      );
      expect(onEventBlocked).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'track', reason: isPreview ? 'preview' : 'consent' })
      );
      expect(build).not.toHaveBeenCalled();
      expect(hook).not.toHaveBeenCalled();
      expect(commit).not.toHaveBeenCalled();
      expect(request.profile?.id).toBe(isPreview ? 'incoming' : 'xda-profile');
    }
  );

  it('propagates content failure without a fallback commit', async () => {
    const { request, options, fetch, commit } = setup({ locale: 'en-US' }, { consent: true });
    const failure = new Error('content failed');
    fetch.mockRejectedValueOnce(failure);
    await expect(request.fetchExperience(options, resolver)).rejects.toBe(failure);
    expect(request.profile).toBeUndefined();
    expect(commit).not.toHaveBeenCalled();
  });
});

describe('Node request content lifetime across ordinary and hybrid fetch', () => {
  it.each(['ordinary', 'handoff'] as const)(
    'discards late %s content after destruction without touching another request',
    async (operation) => {
      const { sdk, options, fetch, commit } = setup({ locale: 'en-US' }, { consent: true });
      const owner = sdk.forRequest({ consent: true, profile: { id: 'owner' } });
      const other = sdk.forRequest({ consent: true, profile: { id: 'other' } });
      const hold = deferred<ExperiencePayload>();
      fetch.mockReturnValueOnce(hold.promise);
      const pending =
        operation === 'ordinary'
          ? owner.fetchExperience(options, resolver)
          : owner.fetchExperienceForHandoff(options, resolver, route);
      owner.destroy();
      hold.resolve(payload('late'));
      await expect(pending).rejects.toThrow(/destroyed/);
      expect(owner.profile?.id).toBe('owner');
      expect(other.profile?.id).toBe('other');
      expect(commit).not.toHaveBeenCalled();
    }
  );
});
