import { describe, expect, it, vi } from 'vitest';

import type { AllowedEventType, BlockedEvent, ConsentState } from './consent.js';
import EventBuilder from './event-builder.js';
import {
  createRuntimeEventMethods,
  EventProfileRequiredError,
  type EventOptimizationData,
  type EventProfile,
  type RuntimeEventDispatch,
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
    consent?: ConsentState;
    allowedEventTypes?: readonly AllowedEventType[];
    onEventBlocked?: (event: BlockedEvent) => void;
    sendResult?: boolean;
    dispatch?: RuntimeEventDispatch;
  } = {}
) {
  let profile = options.profile;
  const upsertProfile = vi.fn().mockResolvedValue(optimizationData('profile-from-api'));
  const sendBatchEvents = vi.fn().mockResolvedValue(options.sendResult ?? true);
  const api: RuntimeOptimizationApiClient = {
    personalization: { upsertProfile },
    analytics: { sendBatchEvents },
  };
  const eventBuilder = new EventBuilder({
    channel: 'server',
    library: { name: '@contentful/experiences-node', version: 'test' },
  });
  const methods = createRuntimeEventMethods(
    api,
    eventBuilder,
    {
      getProfile: () => profile,
      setProfile: (nextProfile) => {
        profile = nextProfile;
      },
      getEventContext: () => ({ locale: 'de-DE' }),
      getConsent: () => options.consent,
      allowedEventTypes: options.allowedEventTypes,
      onEventBlocked: options.onEventBlocked,
    },
    options.dispatch
  );

  return { methods, sendBatchEvents, upsertProfile };
}

describe('RuntimeEventMethods', () => {
  it('sends profile-producing events through Personalization and retains the returned profile', async () => {
    const { methods, upsertProfile } = createFixture({ consent: { events: true } });

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
      { locale: 'de-DE' }
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
      { locale: 'fr-FR' }
    );
    expect(upsertProfile).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        profileId: 'profile-from-api',
        events: [expect.objectContaining({ type: 'track', event: 'checkout' })],
      }),
      { locale: 'de-DE' }
    );
    expect(methods.profile).toEqual({ id: 'profile-from-api' });
  });

  it('sends each interaction immediately through Analytics and preserves false outcomes', async () => {
    const { methods, sendBatchEvents } = createFixture({
      consent: { events: true },
      profile: { id: 'profile-1' },
      sendResult: false,
    });

    await expect(
      methods.trackView({ ...interaction, viewId: 'view-1', viewDurationMs: 100 })
    ).resolves.toBe(false);
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

  it('requires a profile for Analytics events without calling the transport', async () => {
    const { methods, sendBatchEvents } = createFixture({ consent: { events: true } });

    await expect(methods.trackClick(interaction)).rejects.toMatchObject({
      name: 'EventProfileRequiredError',
      method: 'trackClick',
    } satisfies Partial<EventProfileRequiredError>);
    expect(sendBatchEvents).not.toHaveBeenCalled();
  });

  it('validates builder arguments before dispatch', async () => {
    const { methods, sendBatchEvents } = createFixture({
      consent: { events: true },
      profile: { id: 'profile-1' },
    });

    await expect(
      methods.trackView({ ...interaction, viewId: 'view-1', viewDurationMs: -1 })
    ).rejects.toThrow();
    expect(sendBatchEvents).not.toHaveBeenCalled();
  });

  it('supports a runtime-owned dispatch strategy without using the direct transports', async () => {
    const dispatch: RuntimeEventDispatch = {
      personalization: vi.fn().mockResolvedValue(optimizationData('profile-from-dispatch')),
      analytics: vi.fn().mockResolvedValue(true),
    };
    const { methods, sendBatchEvents, upsertProfile } = createFixture({
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
      { id: 'profile-from-dispatch' }
    );
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
          methods.trackClick({ entityId: 'entry', entityKind: 'InlineComponent' })
        ).resolves.toBe(false);

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
      await methods.trackClick({ entityId: 'entry', entityKind: 'InlineComponent' });

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
        await expect(allowed.methods[method](args as never)).resolves.toBe(true);
        await expect(denied.methods[method](args as never)).resolves.toBe(false);
      }
    });

    it('admits flag views through the narrower flag selector or through component', async () => {
      const profile = { id: 'visitor' };
      const args = { componentId: 'flag-1' };

      for (const allowedEventTypes of [['flag'], ['component']] as const) {
        const { methods } = createFixture({ allowedEventTypes, profile });
        await expect(methods.trackFlagView(args)).resolves.toBe(true);
      }
      const { methods } = createFixture({ allowedEventTypes: ['component_click'], profile });
      await expect(methods.trackFlagView(args)).resolves.toBe(false);
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

    it('does not report events that are admitted', async () => {
      const onEventBlocked = vi.fn();
      const { methods } = createFixture({ onEventBlocked, consent: { events: true } });

      await methods.page();

      expect(onEventBlocked).not.toHaveBeenCalled();
    });
  });
});
