import { describe, expect, it, vi } from 'vitest';
import type {
  OptimizationEventStreamEvent,
  FetchExperienceOptions,
} from '@contentful/experiences-runtime';
import { setupPayloadRuntime as setup } from '../runtime.js';

const resolver = { config: { components: {} } };

// Exercise request preparation through Runtime's payload and resolution boundaries.
describe('Node ordinary XDA fetch', () => {
  it('passes request event intent through Runtime resolution without committing through Personalization API', async () => {
    const { sdk, fetch, commit } = setup({ locale: 'en-US' }, { consent: true });
    const request = sdk.forRequest({ consent: true, profile: { id: 'incoming' } });
    const raw = sdk.eventBuilder.buildTrack({ event: 'raw' });
    const events = [{ type: 'identify', userId: 'user' }, raw] satisfies NonNullable<
      FetchExperienceOptions['personalization']
    >['events'];
    const original = globalThis.structuredClone(events);
    const hook = vi.fn((event: OptimizationEventStreamEvent) => event);
    sdk.interceptors.event.add(hook);
    const plan = await request.fetchExperience(
      { experienceId: 'experience', personalization: { events } },
      resolver
    );
    expect(hook).toHaveBeenCalledTimes(events.length);
    expect(fetch).toHaveBeenCalledOnce();
    const sent = fetch.mock.calls[0]![0].personalization;
    expect(sent?.profileId).toBe('incoming');
    expect(sent?.events?.map((event) => event.type)).toEqual(['identify', 'track']);
    expect(sent?.events?.[1]).toEqual({
      ...raw,
      context: { ...raw.context, gdpr: { ...raw.context.gdpr, isConsentGiven: true } },
    });
    expect(events).toEqual(original);
    expect(plan.personalization?.profile?.id).toBe('xda-profile');
    expect(request.profile?.id).toBe('xda-profile');
    expect(commit).not.toHaveBeenCalled();
  });
});
