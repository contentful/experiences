// @vitest-environment jsdom

import {
  ContentfulExperiences as RuntimeExperiences,
  type BuiltRuntimeFetchExperienceOptions,
  type FetchExperienceOptions,
  type FetchResolveOptions,
} from '@contentful/experiences-runtime';
import type { ExperiencePayload } from '@contentful/experiences-sdk-core';
import { ExperienceApiClient as PersonalizationApiClient } from '@contentful/optimization-api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentfulExperiences } from './contentful-experiences.js';
import { clearIdentityCookies, seedConsent } from './test-fixtures/consent.js';
import { completeProfile } from './test-fixtures/profile.js';

const payloadRuntime = RuntimeExperiences.prototype as unknown as {
  fetchExperiencePayload(
    options: BuiltRuntimeFetchExperienceOptions,
    resolve: FetchResolveOptions
  ): Promise<ExperiencePayload>;
};
const resolve = { config: { components: {} } };
let sdk: ContentfulExperiences;

beforeEach(() => {
  seedConsent({ events: true, persistence: true });
  vi.spyOn(payloadRuntime, 'fetchExperiencePayload').mockResolvedValue({
    nodes: [],
    extensions: { personalization: { profile: completeProfile('evaluated-profile') } },
  });
  vi.spyOn(PersonalizationApiClient.prototype, 'upsertProfile').mockResolvedValue({
    profile: completeProfile('evaluated-profile'),
  } as never);
  sdk = new ContentfulExperiences({
    spaceId: 'space',
    environmentId: 'environment',
    locale: 'de-DE',
    delivery: { accessToken: 'token' },
  });
});

afterEach(() => {
  sdk.destroy();
  vi.restoreAllMocks();
  window.localStorage.clear();
  clearIdentityCookies();
});

describe('ordinary Web fetch intent without a handoff', () => {
  it.each(['identify', 'track', 'page'] as const)(
    'builds %s arguments once and evaluates through XDA without extra commitment',
    async (type) => {
      const method =
        type === 'identify' ? 'buildIdentify' : type === 'track' ? 'buildTrack' : 'buildPageView';
      const build = vi.spyOn(sdk.eventBuilder, method);
      const event =
        type === 'identify'
          ? { type, userId: 'visitor' }
          : type === 'track'
            ? { type, event: 'action' }
            : { type, properties: { title: 'Current' } };
      const options: FetchExperienceOptions = {
        experienceId: 'experience',
        personalization: { events: [event] },
      };
      const original = JSON.parse(JSON.stringify(options));
      const hook = vi.fn((event) => ({
        ...event,
        context: { ...event.context, userAgent: 'enriched' },
      }));
      sdk.interceptors.event.add(hook);
      const published = vi.fn();
      const subscription = sdk.states.eventStream.subscribe((event) => {
        if (event) published(event);
      });

      const plan = await sdk.fetchExperience(options, resolve);
      const evaluated = vi.mocked(payloadRuntime.fetchExperiencePayload).mock.calls[0]![0]
        .personalization!.events!;
      expect(evaluated).toMatchObject([
        { type, messageId: expect.any(String), context: { userAgent: 'enriched' } },
      ]);
      expect(evaluated).toHaveLength(1);
      expect(plan.personalization?.profile?.id).toBe('evaluated-profile');
      expect(build).toHaveBeenCalledOnce();
      expect(hook).toHaveBeenCalledOnce();
      expect(published).toHaveBeenCalledExactlyOnceWith(evaluated[0]);
      expect(options).toEqual(original);

      await sdk.fetchExperience({ experienceId: options.experienceId }, resolve);
      expect(
        vi.mocked(payloadRuntime.fetchExperiencePayload).mock.calls[1]?.[0].personalization?.events
      ).toBeUndefined();
      expect(build).toHaveBeenCalledOnce();
      expect(hook).toHaveBeenCalledOnce();
      expect(published).toHaveBeenCalledOnce();
      await sdk.flush();
      expect(PersonalizationApiClient.prototype.upsertProfile).not.toHaveBeenCalled();
      subscription.unsubscribe();
    }
  );

  it('keeps ordinary XDA metadata that is wider than prepared replay without rebuilding raw events', async () => {
    const event = sdk.eventBuilder.buildPageView();
    const raw = {
      ...event,
      context: {
        ...event.context,
        page: { ...event.context.page, query: { filter: ['first', 'second'] } },
      },
    };
    const original = JSON.parse(JSON.stringify(raw));
    const build = vi.spyOn(sdk.eventBuilder, 'buildPageView');
    await sdk.fetchExperience(
      { experienceId: 'experience', personalization: { events: [raw] } },
      resolve
    );
    expect(
      vi.mocked(payloadRuntime.fetchExperiencePayload).mock.calls[0]?.[0].personalization
        ?.events?.[0]
    ).toEqual(raw);
    expect(raw).toEqual(original);
    expect(build).not.toHaveBeenCalled();
    expect(PersonalizationApiClient.prototype.upsertProfile).not.toHaveBeenCalled();
  });

  it('gates arguments before construction without adding a page when all intent is blocked', async () => {
    sdk.consent({ events: false });
    const build = vi.spyOn(sdk.eventBuilder, 'buildTrack');
    await sdk.fetchExperience(
      {
        experienceId: 'experience',
        personalization: { events: [{ type: 'track', event: 'blocked' }] },
      },
      resolve
    );
    expect(
      vi.mocked(payloadRuntime.fetchExperiencePayload).mock.calls[0]?.[0].personalization?.events
    ).toEqual([]);
    expect(build).not.toHaveBeenCalled();
    expect(PersonalizationApiClient.prototype.upsertProfile).not.toHaveBeenCalled();
  });
});
