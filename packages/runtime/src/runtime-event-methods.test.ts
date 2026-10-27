import type { InsightsApiClientRequestOptions } from '@contentful/optimization-api-client';
import { describe, expect, it, vi } from 'vitest';

import type { AllowedEventType, BlockedEvent, ConsentState } from './consent.js';
import EventBuilder from './event-builder.js';
import type { EventInterceptors } from './event-interceptors.js';
import {
  createRuntimeEventMethods,
  EventProfileRequiredError,
  type EventOptimizationData,
  type EventProfile,
  type ExperienceRequestOptions,
  type RuntimeEventDispatch,
  type RuntimeEventBindings,
  type RuntimeOptimizationApiClient,
} from './runtime-event-methods.js';

const interaction = {
  entityId: 'experience-1',
  entityKind: 'Experience' as const,
  optimizationId: 'optimization-1',
  variantId: 'variant-1',
};

function optimizationData(profileId: string): EventOptimizationData {
  return {
    changes: [],
    profile: { id: profileId },
    selectedOptimizations: [],
  } as unknown as EventOptimizationData;
}

function createFixture(
  options: {
    profile?: EventProfile;
    eventInterceptors?: EventInterceptors;
    consent?: ConsentState;
    allowedEventTypes?: readonly AllowedEventType[];
    onEventBlocked?: (event: BlockedEvent) => void;
    reportBlockedEvent?: (event: BlockedEvent) => void;
    sendResult?: boolean;
    dispatch?: RuntimeEventDispatch;
    requireProfile?: boolean;
    insightsOptions?: InsightsApiClientRequestOptions;
    experienceOptions?: ExperienceRequestOptions;
  } = {}
) {
  let profile = options.profile;
  const upsertProfile = vi.fn().mockResolvedValue(optimizationData('profile-from-api'));
  const sendBatchEvents = vi.fn().mockResolvedValue(options.sendResult ?? true);
  const api: RuntimeOptimizationApiClient = {
    experience: { upsertProfile },
    insights: { sendBatchEvents },
  };
  const eventBuilder = new EventBuilder({
    channel: 'server',
    library: { name: '@contentful/experiences-node', version: 'test' },
  });
  let revision = 0;
  const setProfile = vi.fn((nextProfile: EventProfile) => {
    profile = nextProfile;
  });
  const bindings: RuntimeEventBindings = {
    getProfile: () => profile,
    getEventContext: () => ({ locale: 'de-DE' }),
    getLocale: () => 'en-US',
    getConsent: () => options.consent,
    allowedEventTypes: options.allowedEventTypes,
    requireProfile: options.requireProfile,
    getInsightsOptions: () => options.insightsOptions,
    getExperienceOptions: () => options.experienceOptions,
  };
  const methods =
    options.dispatch === undefined
      ? createRuntimeEventMethods(api, eventBuilder, {
          ...bindings,
          setProfile,
          eventInterceptors: options.eventInterceptors,
          getProfileRevision: () => revision,
          onEventBlocked: options.onEventBlocked,
        })
      : createRuntimeEventMethods(
          api,
          eventBuilder,
          { ...bindings, reportBlockedEvent: options.reportBlockedEvent },
          options.dispatch
        );

  return {
    methods,
    sendBatchEvents,
    upsertProfile,
    setProfile,
    invalidateProfile: () => {
      revision++;
    },
  };
}

describe('RuntimeEventMethods', () => {
  describe('direct event interception', () => {
    const builder = new EventBuilder({
      channel: 'server',
      library: { name: '@contentful/experiences-node', version: 'test' },
    });

    it('keeps the original consent gate before invoking hooks', async () => {
      const run = vi.fn<EventInterceptors['run']>(async (event) => event);
      const f = createFixture({ consent: { events: false }, eventInterceptors: { run } });
      await expect(f.methods.track({ event: 'purchase' })).resolves.toEqual({ accepted: false });
      expect(run).not.toHaveBeenCalled();
      expect(f.upsertProfile).not.toHaveBeenCalled();
    });

    it('blocks a valid final Personalization type and reports that type even when the callback throws', async () => {
      const rewritten = builder.buildTrack({ event: 'purchase' });
      const onEventBlocked = vi.fn(() => {
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
        profile: { id: 'visitor' },
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
          profile: { id: 'visitor' },
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

    it('captures the profile revision before awaiting hooks', async () => {
      let release!: (event: unknown) => void;
      const run = vi.fn<EventInterceptors['run']>(
        () =>
          new Promise((resolve) => {
            release = resolve;
          })
      );
      const f = createFixture({ profile: { id: 'visitor' }, eventInterceptors: { run } });
      const sending = f.methods.page();
      f.invalidateProfile();
      release(builder.buildPageView());

      await expect(sending).resolves.toMatchObject({ accepted: true });
      expect(f.upsertProfile.mock.calls[0]?.[0].profileId).toBe('visitor');
      expect(f.setProfile).not.toHaveBeenCalled();
      expect(f.methods.profile).toEqual({ id: 'visitor' });
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

  it('sends profile-producing events through Personalization and retains the returned profile', async () => {
    const onEventBlocked = vi.fn();
    const { methods, upsertProfile } = createFixture({
      consent: { events: true },
      onEventBlocked,
    });

    await expect(methods.page()).resolves.toMatchObject({
      accepted: true,
      data: { profile: { id: 'profile-from-api' } },
    });
    await methods.identify({ userId: 'user-1', locale: 'fr-FR' });
    await methods.track({ event: 'checkout' });

    expect(upsertProfile).toHaveBeenNthCalledWith(
      1,
      {
        profileId: undefined,
        events: [
          expect.objectContaining({
            type: 'page',
            context: expect.objectContaining({
              gdpr: { isConsentGiven: true },
              locale: 'de-DE',
            }),
          }),
        ],
      },
      { locale: 'en-US' }
    );
    expect(upsertProfile).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        profileId: 'profile-from-api',
        events: [
          expect.objectContaining({
            type: 'identify',
            context: expect.objectContaining({ locale: 'fr-FR' }),
          }),
        ],
      }),
      { locale: 'en-US' }
    );
    expect(upsertProfile).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        profileId: 'profile-from-api',
        events: [expect.objectContaining({ type: 'track', event: 'checkout' })],
      }),
      { locale: 'en-US' }
    );
    expect(methods.profile).toEqual({ id: 'profile-from-api' });
    expect(onEventBlocked).not.toHaveBeenCalled();
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

  it('keeps the current profile when queued Personalization work is accepted without response data', async () => {
    const dispatch: RuntimeEventDispatch = {
      personalization: vi.fn().mockResolvedValue({ accepted: true }),
      analytics: vi.fn().mockResolvedValue(true),
    };
    const { methods } = createFixture({ profile: { id: 'current-profile' }, dispatch });

    await expect(methods.page()).resolves.toEqual({ accepted: true });

    expect(methods.profile).toEqual({ id: 'current-profile' });
  });

  it('propagates direct Personalization transport errors', async () => {
    const error = new Error('Personalization transport failed');
    const { methods, upsertProfile } = createFixture({ profile: { id: 'current-profile' } });
    upsertProfile.mockRejectedValue(error);

    await expect(methods.page()).rejects.toBe(error);
    expect(methods.profile).toEqual({ id: 'current-profile' });
  });

  it('sends each interaction immediately through Analytics and reports admission even when the transport fails', async () => {
    const { methods, sendBatchEvents } = createFixture({
      consent: { events: true },
      profile: { id: 'profile-1' },
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
      expect(batch.profile).toEqual({ id: 'profile-1' });
      expect(batch.events).toHaveLength(1);
    }
  });

  it('requires a profile for stateless Analytics events without calling the transport', async () => {
    const { methods, sendBatchEvents } = createFixture({
      consent: { events: true },
      requireProfile: true,
    });

    await expect(methods.trackClick(interaction)).rejects.toMatchObject({
      name: 'EventProfileRequiredError',
      method: 'trackClick',
    } satisfies Partial<EventProfileRequiredError>);
    expect(sendBatchEvents).not.toHaveBeenCalled();
  });

  it('warns and drops a stateful Analytics event without a profile, as Optimization does', async () => {
    const { methods, sendBatchEvents } = createFixture({ consent: { events: true } });

    await expect(
      methods.trackView({ ...interaction, viewId: 'view-1', viewDurationMs: 100 })
    ).resolves.toEqual({ accepted: true });
    for (const call of [
      () => methods.trackClick(interaction),
      () => methods.trackHover({ ...interaction, hoverId: 'hover-1', hoverDurationMs: 50 }),
      () => methods.trackFlagView({ componentId: 'flag-1' }),
    ]) {
      await expect(call()).resolves.toEqual({ accepted: true });
    }
    expect(sendBatchEvents).not.toHaveBeenCalled();
  });

  it('forwards request-scoped Insights options with a direct Analytics send', async () => {
    const beacon = vi.fn(() => true);
    const { methods, sendBatchEvents } = createFixture({
      consent: { events: true },
      profile: { id: 'profile-1' },
      insightsOptions: { beacon },
    });

    await methods.trackClick(interaction);

    expect(sendBatchEvents).toHaveBeenCalledWith(expect.any(Array), { beacon });
  });

  it('validates arguments before consent and profile checks, except the early view consent guard', async () => {
    const onEventBlocked = vi.fn();
    const { methods, sendBatchEvents, upsertProfile } = createFixture({
      consent: { events: false },
      onEventBlocked,
    });

    await expect(methods.track({ event: 123 as unknown as string })).rejects.toThrow();
    await expect(
      methods.trackClick({ ...interaction, entityId: 123 as unknown as string })
    ).rejects.toThrow();
    expect(onEventBlocked).not.toHaveBeenCalled();

    await expect(
      methods.trackView({ ...interaction, viewId: 'view-1', viewDurationMs: -1 })
    ).resolves.toEqual({ accepted: false });
    expect(onEventBlocked).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'trackView', reason: 'consent' })
    );
    expect(upsertProfile).not.toHaveBeenCalled();
    expect(sendBatchEvents).not.toHaveBeenCalled();
  });

  it('supports a runtime-owned dispatch strategy without using the direct transports', async () => {
    const dispatch: RuntimeEventDispatch = {
      personalization: vi.fn().mockResolvedValue({
        accepted: true,
        data: optimizationData('profile-from-dispatch'),
      }),
      analytics: vi.fn().mockResolvedValue(true),
    };
    const { methods, sendBatchEvents, upsertProfile, setProfile } = createFixture({
      consent: { events: true },
      dispatch,
      profile: { id: 'initial-profile' },
    });

    await methods.page();
    await methods.trackClick(interaction);

    expect(dispatch.personalization).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'page',
        context: expect.objectContaining({ gdpr: { isConsentGiven: true } }),
      }),
      { id: 'initial-profile' }
    );
    expect(dispatch.analytics).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'exo_node_click' }),
      { id: 'initial-profile' }
    );
    expect(methods.profile).toEqual({ id: 'initial-profile' });
    expect(setProfile).not.toHaveBeenCalled();
    expect(upsertProfile).not.toHaveBeenCalled();
    expect(sendBatchEvents).not.toHaveBeenCalled();
  });

  describe('consent gating', () => {
    it('emits only allowed event types while event consent is undecided or denied', async () => {
      for (const consent of [undefined, { events: false }] as const) {
        const { methods, upsertProfile, sendBatchEvents } = createFixture({
          consent,
          profile: { id: 'visitor' },
        });

        await methods.page();
        await expect(methods.track({ event: 'purchase' })).resolves.toEqual({ accepted: false });
        await expect(
          methods.trackClick({ entityId: 'entry', entityKind: 'Experience' })
        ).resolves.toEqual({ accepted: false });

        expect(upsertProfile).toHaveBeenCalledTimes(1);
        expect(sendBatchEvents).not.toHaveBeenCalled();
      }
    });

    it('honors a custom allowedEventTypes list', async () => {
      const { methods, upsertProfile } = createFixture({
        consent: { events: false },
        allowedEventTypes: ['track'],
        profile: { id: 'visitor' },
      });

      await expect(methods.page()).resolves.toEqual({ accepted: false });
      await methods.track({ event: 'purchase' });

      expect(upsertProfile).toHaveBeenCalledTimes(1);
    });

    it('emits everything once event consent is granted', async () => {
      const { methods, upsertProfile, sendBatchEvents } = createFixture({
        consent: { events: true },
        profile: { id: 'visitor' },
      });

      await methods.track({ event: 'purchase' });
      await methods.trackClick({ entityId: 'entry', entityKind: 'Experience' });

      expect(upsertProfile).toHaveBeenCalledTimes(1);
      expect(sendBatchEvents).toHaveBeenCalledTimes(1);
    });

    it('maps interaction methods to their own selectors', async () => {
      const profile = { id: 'visitor' };
      const cases = [
        ['trackView', 'component'],
        ['trackClick', 'component_click'],
        ['trackHover', 'component_hover'],
      ] as const;

      for (const [method, selector] of cases) {
        const allowed = createFixture({ allowedEventTypes: [selector], profile });
        const denied = createFixture({ allowedEventTypes: [], profile });
        const args = {
          trackView: { ...interaction, viewId: 'view-1', viewDurationMs: 100 },
          trackClick: interaction,
          trackHover: { ...interaction, hoverId: 'hover-1', hoverDurationMs: 50 },
        }[method];
        // The argument shape differs per method; each is valid for its own method here.
        const [admitted, blocked] = [{ accepted: true }, { accepted: false }];
        await expect(allowed.methods[method](args as never)).resolves.toEqual(admitted);
        await expect(denied.methods[method](args as never)).resolves.toEqual(blocked);
        expect(allowed.sendBatchEvents).toHaveBeenCalledTimes(1);
        expect(denied.sendBatchEvents).not.toHaveBeenCalled();
      }
    });

    it('admits flag views through the narrower flag selector or through component', async () => {
      const profile = { id: 'visitor' };
      const args = { componentId: 'flag-1' };

      for (const allowedEventTypes of [['flag'], ['component']] as const) {
        const { methods, sendBatchEvents } = createFixture({ allowedEventTypes, profile });
        await expect(methods.trackFlagView(args)).resolves.toEqual({ accepted: true });
        expect(sendBatchEvents).toHaveBeenCalledTimes(1);
      }
      const { methods, sendBatchEvents } = createFixture({
        allowedEventTypes: ['component_click'],
        profile,
      });
      await expect(methods.trackFlagView(args)).resolves.toEqual({ accepted: false });
      expect(sendBatchEvents).not.toHaveBeenCalled();
    });

    it('reports each blocked event to onEventBlocked, and survives a throwing callback', async () => {
      const onEventBlocked = vi.fn();
      const { methods } = createFixture({ onEventBlocked, profile: { id: 'visitor' } });

      await methods.track({ event: 'purchase' });
      expect(onEventBlocked).toHaveBeenCalledWith({
        reason: 'consent',
        method: 'track',
        args: [{ event: 'purchase' }],
      });

      onEventBlocked.mockImplementation(() => {
        throw new Error('logger down');
      });
      await expect(methods.track({ event: 'again' })).resolves.toEqual({ accepted: false });
    });

    it('propagates errors from a custom dispatch owner blocked-event reporter', async () => {
      const error = new Error('blocked-event subscriber failed');
      const reportBlockedEvent = vi.fn(() => {
        throw error;
      });
      const dispatch: RuntimeEventDispatch = {
        personalization: vi.fn(),
        analytics: vi.fn(),
      };
      const { methods } = createFixture({ reportBlockedEvent, dispatch });

      await expect(methods.track({ event: 'purchase' })).rejects.toBe(error);
      expect(reportBlockedEvent).toHaveBeenCalledWith({
        reason: 'consent',
        method: 'track',
        args: [{ event: 'purchase' }],
      });
      expect(dispatch.personalization).not.toHaveBeenCalled();
    });
  });

  describe('trackView acceptance result', () => {
    const view = { ...interaction, viewId: 'view-1', viewDurationMs: 100 };

    it('resolves { accepted: false } for a consent-blocked view and reports it', async () => {
      const onEventBlocked = vi.fn();
      const { methods, sendBatchEvents } = createFixture({
        consent: { events: false },
        profile: { id: 'visitor' },
        onEventBlocked,
      });

      await expect(methods.trackView(view)).resolves.toEqual({ accepted: false });
      expect(sendBatchEvents).not.toHaveBeenCalled();
      expect(onEventBlocked).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'consent', method: 'trackView' })
      );
    });

    it('keeps the stateless profile requirement for views', async () => {
      const { methods } = createFixture({ consent: { events: true }, requireProfile: true });

      await expect(methods.trackView(view)).rejects.toBeInstanceOf(EventProfileRequiredError);
    });
  });
});
