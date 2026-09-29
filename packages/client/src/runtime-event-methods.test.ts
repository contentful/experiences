import { describe, expect, it, vi } from 'vitest';

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
    consent?: boolean;
    sendResult?: boolean;
    dispatch?: RuntimeEventDispatch;
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
    },
    options.dispatch
  );

  return { methods, sendBatchEvents, upsertProfile };
}

describe('RuntimeEventMethods', () => {
  it('sends profile-producing events through Experience and retains the returned profile', async () => {
    const { methods, upsertProfile } = createFixture({ consent: true });

    await expect(methods.page()).resolves.toMatchObject({
      profile: { id: 'profile-from-api' },
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

  it('sends each interaction immediately through Insights and preserves false outcomes', async () => {
    const { methods, sendBatchEvents } = createFixture({
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

  it('requires a profile for Insights events without calling the transport', async () => {
    const { methods, sendBatchEvents } = createFixture();

    await expect(methods.trackClick(interaction)).rejects.toMatchObject({
      name: 'EventProfileRequiredError',
      method: 'trackClick',
    } satisfies Partial<EventProfileRequiredError>);
    expect(sendBatchEvents).not.toHaveBeenCalled();
  });

  it('validates builder arguments before dispatch', async () => {
    const { methods, sendBatchEvents } = createFixture({ profile: { id: 'profile-1' } });

    await expect(
      methods.trackView({ ...interaction, viewId: 'view-1', viewDurationMs: -1 })
    ).rejects.toThrow();
    expect(sendBatchEvents).not.toHaveBeenCalled();
  });

  it('supports a runtime-owned dispatch strategy without using the direct transports', async () => {
    const dispatch: RuntimeEventDispatch = {
      experience: vi.fn().mockResolvedValue(optimizationData('profile-from-dispatch')),
      insights: vi.fn().mockResolvedValue(true),
    };
    const { methods, sendBatchEvents, upsertProfile } = createFixture({
      consent: true,
      dispatch,
      profile: { id: 'initial-profile' },
    });

    await methods.page();
    await methods.trackClick(interaction);

    expect(dispatch.experience).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'page',
        context: expect.objectContaining({ gdpr: { isConsentGiven: true } }),
      }),
      { id: 'initial-profile' }
    );
    expect(dispatch.insights).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'exo_node_click' }),
      { id: 'profile-from-dispatch' }
    );
    expect(upsertProfile).not.toHaveBeenCalled();
    expect(sendBatchEvents).not.toHaveBeenCalled();
  });
});
