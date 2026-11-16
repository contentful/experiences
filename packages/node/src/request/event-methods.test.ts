import { analyticsProfileFixture as completeProfile } from '../test/fixtures/profile.js';
import type { InsightsApiClientRequestOptions as AnalyticsApiClientRequestOptions } from '@contentful/optimization-api-client';
import { describe, expect, it, vi } from 'vitest';

import type {
  EventProfile,
  PersonalizationRequestOptions,
  AllowedEventType,
  BlockedEvent,
  ConsentState,
  EventInterceptors,
  EventOptimizationData,
} from '@contentful/experiences-runtime';
import { EventBuilder, EventProfileRequiredError } from '@contentful/experiences-runtime';
import { createEventMethods, type DirectEventBindings, type EventApi } from './event-methods.js';

const interaction = {
  entityId: 'experience-1',
  entityKind: 'Experience' as const,
  optimizationId: 'optimization-1',
  variantId: 'variant-1',
};

const visitor = completeProfile('visitor');

function optimizationData(profileId: string): EventOptimizationData {
  return {
    changes: [],
    profile: completeProfile(profileId),
    selectedOptimizations: [],
  } as unknown as EventOptimizationData;
}

function createFixture(
  options: {
    profile?: ReturnType<DirectEventBindings['getProfile']>;
    eventInterceptors?: EventInterceptors;
    consent?: ConsentState;
    allowedEventTypes?: readonly AllowedEventType[];
    onEventBlocked?: (event: BlockedEvent) => void;
    sendResult?: boolean;
    analyticsOptions?: AnalyticsApiClientRequestOptions;
    personalizationOptions?: PersonalizationRequestOptions;
    isActive?: () => boolean;
  } = {}
) {
  let profile = options.profile;
  const upsertProfile = vi.fn().mockResolvedValue(optimizationData('profile-from-api'));
  const sendBatchEvents = vi.fn().mockResolvedValue(options.sendResult ?? true);
  const api: EventApi = {
    personalization: { upsertProfile },
    analytics: { sendBatchEvents },
  };
  const eventBuilder = new EventBuilder({
    channel: 'server',
    library: { name: '@contentful/experiences-node', version: 'test' },
  });
  let revision = 0;
  const setProfile = vi.fn((nextProfile: EventProfile) => {
    profile = nextProfile;
  });
  const bindings: DirectEventBindings = {
    getProfile: () => profile,
    getEventContext: () => ({ locale: 'de-DE' }),
    getLocale: () => 'en-US',
    getConsent: () => options.consent ?? {},
    getIsPreview: () => false,
    allowedEventTypes: options.allowedEventTypes,
    getAnalyticsOptions: () => options.analyticsOptions,
    getPersonalizationOptions: () => options.personalizationOptions,
    setProfile,
    eventInterceptors: options.eventInterceptors,
    getProfileRevision: () => revision,
    isActive: options.isActive ?? (() => true),
    onEventBlocked: options.onEventBlocked,
  };
  const methods = createEventMethods(api, eventBuilder, bindings);

  return {
    methods,
    sendBatchEvents,
    upsertProfile,
    setProfile,
    bindings,
    invalidateProfile: () => {
      revision++;
    },
  };
}

describe('Node direct event methods', () => {
  it('drops a direct request disposed during its async hook before transport', async () => {
    let active = true;
    const run = vi.fn<EventInterceptors['run']>(async (event) => {
      active = false;
      return event;
    });
    const f = createFixture({
      consent: { events: true },
      profile: completeProfile('visitor'),
      isActive: () => active,
      eventInterceptors: { run },
    });
    await expect(f.methods.page()).resolves.toEqual({ accepted: false });
    active = true;
    await expect(f.methods.trackClick(interaction)).resolves.toEqual({ accepted: false });
    expect(f.upsertProfile).not.toHaveBeenCalled();
    expect(f.sendBatchEvents).not.toHaveBeenCalled();
  });

  it('preserves successful Personalization acceptance without publishing after request disposal', async () => {
    let active = true;
    const f = createFixture({ isActive: () => active });
    f.upsertProfile.mockImplementationOnce(async () => {
      active = false;
      return optimizationData('late');
    });
    await expect(f.methods.page()).resolves.toEqual({
      accepted: true,
      data: optimizationData('late'),
    });
    expect(f.setProfile).not.toHaveBeenCalled();
  });

  it('preserves successful Analytics acceptance after request disposal', async () => {
    let active = true;
    const f = createFixture({
      consent: { events: true },
      profile: completeProfile('visitor'),
      isActive: () => active,
    });
    f.sendBatchEvents.mockImplementationOnce(async () => {
      active = false;
      return true;
    });
    await expect(f.methods.trackClick(interaction)).resolves.toEqual({ accepted: true });
    expect(f.sendBatchEvents).toHaveBeenCalledTimes(1);
  });

  describe('direct event interception', () => {
    const builder = new EventBuilder({
      channel: 'server',
      library: { name: '@contentful/experiences-node', version: 'test' },
    });

    it('blocks a valid final Personalization type and reports that type even when the callback throws', async () => {
      const rewritten = builder.buildTrack({ event: 'purchase' });
      const onEventBlocked = vi.fn(function (this: DirectEventBindings) {
        throw new Error('logger failed');
      });
      const run = vi.fn<EventInterceptors['run']>().mockResolvedValue(rewritten);
      const f = createFixture({
        consent: { events: false },
        eventInterceptors: { run },
        onEventBlocked,
      });

      await expect(f.methods.page()).resolves.toEqual({ accepted: false });
      expect(run).toHaveBeenCalledOnce();
      expect(onEventBlocked.mock.contexts[0]).toBe(f.bindings);
      expect(onEventBlocked).toHaveBeenCalledExactlyOnceWith({
        reason: 'consent',
        method: 'track',
        args: [rewritten],
      });
      expect(f.upsertProfile).not.toHaveBeenCalled();
      expect(f.setProfile).not.toHaveBeenCalled();
    });

    it('blocks a rewritten Analytics type with an accurate view admission result', async () => {
      const rewritten = builder.buildClick(interaction);
      const onEventBlocked = vi.fn();
      const run = vi.fn<EventInterceptors['run']>().mockResolvedValue(rewritten);
      const f = createFixture({
        consent: { events: false },
        allowedEventTypes: ['component'],
        profile: visitor,
        eventInterceptors: { run },
        onEventBlocked,
      });

      await expect(
        f.methods.trackView({ ...interaction, viewId: 'view', viewDurationMs: 100 })
      ).resolves.toEqual({ accepted: false });
      expect(onEventBlocked).toHaveBeenCalledExactlyOnceWith({
        reason: 'consent',
        method: 'trackClick',
        args: [rewritten],
      });
      expect(f.sendBatchEvents).not.toHaveBeenCalled();
    });

    it.each(['personalization', 'analytics'] as const)(
      'rejects invalid %s rewrites before final consent reporting',
      async (transport) => {
        const run = vi.fn<EventInterceptors['run']>().mockResolvedValue({ type: 'track' });
        const onEventBlocked = vi.fn();
        const f = createFixture({
          profile: visitor,
          allowedEventTypes: ['page', 'component'],
          eventInterceptors: { run },
          onEventBlocked,
        });
        const sending =
          transport === 'personalization'
            ? f.methods.page()
            : f.methods.trackView({ ...interaction, viewId: 'view', viewDurationMs: 100 });
        await expect(sending).rejects.toThrow();
        expect(onEventBlocked).not.toHaveBeenCalled();
        expect(f.upsertProfile).not.toHaveBeenCalled();
        expect(f.sendBatchEvents).not.toHaveBeenCalled();
      }
    );

    it('propagates hook errors without transport or profile publication', async () => {
      const error = new Error('hook failed');
      const run = vi.fn<EventInterceptors['run']>().mockRejectedValue(error);
      const f = createFixture({ eventInterceptors: { run } });
      await expect(f.methods.page()).rejects.toBe(error);
      expect(f.upsertProfile).not.toHaveBeenCalled();
      expect(f.setProfile).not.toHaveBeenCalled();
    });

    it('selects the current profile after hooks while guarding publication with the original revision', async () => {
      let release!: (event: unknown) => void;
      const run = vi.fn<EventInterceptors['run']>(
        () =>
          new Promise((resolve) => {
            release = resolve;
          })
      );
      const f = createFixture({ profile: { id: 'visitor' }, eventInterceptors: { run } });
      const sending = f.methods.page();
      expect(f.upsertProfile).not.toHaveBeenCalled();
      const currentProfile = completeProfile('current-visitor');
      f.setProfile(currentProfile);
      f.invalidateProfile();
      release(builder.buildPageView());

      await expect(sending).resolves.toMatchObject({ accepted: true });
      expect(f.upsertProfile.mock.calls[0]?.[0].profileId).toBe('current-visitor');
      expect(f.setProfile).toHaveBeenCalledExactlyOnceWith(currentProfile);
      expect(f.methods.profile).toEqual(currentProfile);
    });

    it('preserves immediate transport start with an empty registry', async () => {
      const run = vi.fn<EventInterceptors['run']>(async (event) => event);
      const f = createFixture({ eventInterceptors: { run, count: () => 0 } });
      const sending = f.methods.page();
      expect(f.upsertProfile).toHaveBeenCalledOnce();
      expect(run).not.toHaveBeenCalled();
      await sending;
    });
  });

  it('routes Personalization methods through request transport and adopts its response', async () => {
    const personalizationOptions = { ip: '203.0.113.7', plainText: true, locale: 'it-IT' };
    const { methods, upsertProfile } = createFixture({
      consent: { events: true },
      personalizationOptions,
    });
    await expect(methods.page()).resolves.toEqual({
      accepted: true,
      data: optimizationData('profile-from-api'),
    });
    await methods.identify({ userId: 'user-1', locale: 'fr-FR' });
    await methods.track({ event: 'checkout' });

    const requests = upsertProfile.mock.calls.map(([body]) => body);
    expect(requests.map(({ events }) => events[0].type)).toEqual(['page', 'identify', 'track']);
    expect(requests.map(({ profileId }) => profileId)).toEqual([
      undefined,
      'profile-from-api',
      'profile-from-api',
    ]);
    expect(requests[0].events[0].context.locale).toBe('de-DE');
    expect(requests[1].events[0]).toMatchObject({ userId: 'user-1', context: { locale: 'fr-FR' } });
    for (const [, options] of upsertProfile.mock.calls)
      expect(options).toEqual({ ...personalizationOptions, locale: 'en-US' });
    expect(methods.profile).toEqual(completeProfile('profile-from-api'));
  });

  it('does not publish a direct response after the owner changes its profile revision', async () => {
    let resolve!: (value: EventOptimizationData) => void;
    const response = new Promise<EventOptimizationData>((settle) => {
      resolve = settle;
    });
    const f = createFixture({ profile: { id: 'current-profile' } });
    f.upsertProfile.mockReturnValueOnce(response);
    const result = f.methods.page();
    f.invalidateProfile();
    resolve(optimizationData('stale-profile'));

    await expect(result).resolves.toMatchObject({ accepted: true });
    expect(f.methods.profile).toEqual({ id: 'current-profile' });
    expect(f.setProfile).not.toHaveBeenCalled();
  });

  it.each(['Personalization', 'Analytics'] as const)(
    'propagates %s transport errors without profile publication',
    async (transport) => {
      const error = new Error('transport failed');
      const f = createFixture({ profile: visitor, consent: { events: true } });
      const send = transport === 'Personalization' ? f.upsertProfile : f.sendBatchEvents;
      send.mockRejectedValue(error);
      await expect(
        transport === 'Personalization' ? f.methods.page() : f.methods.trackClick(interaction)
      ).rejects.toBe(error);
      expect(f.methods.profile).toEqual(visitor);
      expect(f.setProfile).not.toHaveBeenCalled();
    }
  );

  it('sends each interaction immediately through Analytics and reports admission even when the transport fails', async () => {
    const { methods, sendBatchEvents } = createFixture({
      consent: { events: true },
      profile: completeProfile('profile-1'),
      sendResult: false,
    });

    await expect(
      methods.trackView({ ...interaction, viewId: 'view-1', viewDurationMs: 100 })
    ).resolves.toEqual({ accepted: true });
    await methods.trackClick(interaction);
    await methods.trackHover({ ...interaction, hoverId: 'hover-1', hoverDurationMs: 50 });
    await methods.trackFlagView({ componentId: 'flag-1' });

    expect(sendBatchEvents).toHaveBeenCalledTimes(4);
    expect(sendBatchEvents.mock.calls.map(([[batch]]) => batch.events[0].type)).toEqual([
      'exo_node_view',
      'exo_node_click',
      'exo_node_hover',
      'component',
    ]);
    for (const [[batch]] of sendBatchEvents.mock.calls) {
      expect(batch.profile).toEqual(completeProfile('profile-1'));
      expect(batch.events).toHaveLength(1);
    }
  });

  it('throws its missing-profile error before sending Analytics', async () => {
    const { methods, sendBatchEvents } = createFixture({ consent: { events: true } });
    await expect(methods.trackClick(interaction)).rejects.toBeInstanceOf(EventProfileRequiredError);
    expect(sendBatchEvents).not.toHaveBeenCalled();
  });

  it('retains incomplete profile fields and uses its ID for Personalization', async () => {
    const initial = { id: 'profile-1', traits: { plan: 'pro' }, audiences: ['a'] };
    const { methods, upsertProfile } = createFixture({
      consent: { events: true },
      profile: initial,
    });
    expect(methods.profile).toEqual(initial);
    await methods.page();
    expect(upsertProfile.mock.calls[0]?.[0].profileId).toBe(initial.id);
  });

  it('forwards request-scoped Analytics options with a direct Analytics send', async () => {
    const beacon = vi.fn(() => true);
    const { methods, sendBatchEvents } = createFixture({
      consent: { events: true },
      profile: completeProfile('profile-1'),
      analyticsOptions: { beacon },
    });

    await methods.trackClick(interaction);

    expect(sendBatchEvents).toHaveBeenCalledWith(expect.any(Array), { beacon });
  });

  describe('consent gating', () => {
    it('calls the captured initial diagnostic callback without a receiver and swallows failures', async () => {
      const onEventBlocked = vi.fn(function (this: unknown) {
        return this;
      });
      const { methods } = createFixture({ onEventBlocked });
      await expect(methods.track({ event: 'blocked' })).resolves.toEqual({ accepted: false });
      expect(onEventBlocked.mock.contexts).toEqual([undefined]);
      expect(onEventBlocked).toHaveBeenCalledExactlyOnceWith({
        reason: 'consent',
        method: 'track',
        args: [{ event: 'blocked' }],
      });
      onEventBlocked.mockImplementation(() => {
        throw new Error('diagnostic');
      });
      await expect(methods.track({ event: 'again' })).resolves.toEqual({ accepted: false });
    });
  });
});
