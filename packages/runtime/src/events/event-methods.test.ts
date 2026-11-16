import { describe, expect, it, vi } from 'vitest';
import { analyticsProfileFixture } from '../test/fixtures/profile.js';
import type { ConsentState } from './consent.js';
import EventBuilder, {
  type ClickBuilderArgs,
  type UniversalEventBuilderArgs,
} from './event-builder.js';
import {
  emitAnalyticsEvent,
  emitPersonalizationEvent,
  type AnalyticsEventOwner,
} from './event-methods.js';

const builder = new EventBuilder({
  channel: 'server',
  library: { name: 'test', version: 'test' },
});
const interaction: ClickBuilderArgs = { entityId: 'experience', entityKind: 'Experience' };

function owner(overrides: Partial<AnalyticsEventOwner> = {}): AnalyticsEventOwner {
  return {
    isActive: () => true,
    getIsPreview: () => false,
    getConsent: () => ({ events: true }),
    getAllowedEventTypes: () => undefined,
    reportBlockedEvent: vi.fn(),
    getProfile: vi.fn(() => analyticsProfileFixture('visitor')),
    onMissingProfile: vi.fn(),
    ...overrides,
  };
}

describe('shared event preparation', () => {
  it('returns before preview, context, and construction for an inactive owner', async () => {
    const policy = owner({
      isActive: () => false,
      getIsPreview: vi.fn(() => true),
      getEventContext: vi.fn(),
    });
    const build = vi.fn(() => builder.buildPageView());
    const send = vi.fn();

    await expect(emitPersonalizationEvent(policy, 'page', {}, build, send)).resolves.toEqual({
      accepted: false,
    });
    expect(policy.getIsPreview).not.toHaveBeenCalled();
    expect(policy.getEventContext).not.toHaveBeenCalled();
    expect(policy.reportBlockedEvent).not.toHaveBeenCalled();
    expect(build).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('reports preview with original arguments before context, construction, or profile lookup', async () => {
    const policy = owner({ getIsPreview: () => true, getEventContext: vi.fn() });
    const build = vi.fn(() => builder.buildClick(interaction));
    const send = vi.fn();

    await expect(
      emitAnalyticsEvent(policy, 'trackClick', interaction, build, send)
    ).resolves.toEqual({
      accepted: false,
      reason: 'preview',
    });
    expect(policy.reportBlockedEvent).toHaveBeenCalledExactlyOnceWith({
      reason: 'preview',
      method: 'trackClick',
      args: [interaction],
    });
    expect(policy.getEventContext).not.toHaveBeenCalled();
    expect(build).not.toHaveBeenCalled();
    expect(policy.getProfile).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('copies arguments over owner context with caller fields taking precedence', async () => {
    const context = { locale: 'de-DE', campaign: { name: 'Owner' } };
    const args = { locale: 'fr-FR', campaign: { source: 'Caller' } };
    const policy = owner({ getEventContext: () => context });
    const build = vi.fn((values: UniversalEventBuilderArgs) => builder.buildPageView(values));

    await emitPersonalizationEvent(policy, 'page', args, build, vi.fn());

    expect(build).toHaveBeenCalledExactlyOnceWith(args);
    const received = build.mock.calls[0]![0];
    expect(received).not.toBe(args);
    expect(received.campaign).toBe(args.campaign);
    expect(context.campaign).toEqual({ name: 'Owner' });

    await emitPersonalizationEvent(policy, 'page', {}, build, vi.fn());
    expect(build).toHaveBeenLastCalledWith(context);
  });

  it('checks view consent before construction and leaves invalid arguments unbuilt', async () => {
    const policy = owner({ getConsent: () => ({ events: false }), getEventContext: vi.fn() });
    const build = vi.fn(() => {
      throw new Error('invalid arguments');
    });
    const send = vi.fn();

    await expect(emitAnalyticsEvent(policy, 'trackView', {}, build, send)).resolves.toEqual({
      accepted: false,
    });
    expect(policy.reportBlockedEvent).toHaveBeenCalledExactlyOnceWith({
      reason: 'consent',
      method: 'trackView',
      args: [{}],
    });
    expect(policy.getEventContext).not.toHaveBeenCalled();
    expect(build).not.toHaveBeenCalled();
    expect(policy.getProfile).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('propagates ordinary construction errors before consent reporting', async () => {
    const policy = owner({ getConsent: () => ({ events: false }) });
    const error = new Error('invalid arguments');
    const build = () => {
      throw error;
    };
    const send = vi.fn();

    await expect(emitPersonalizationEvent(policy, 'track', {}, build, send)).rejects.toBe(error);
    await expect(emitAnalyticsEvent(policy, 'trackClick', {}, build, send)).rejects.toBe(error);
    expect(policy.reportBlockedEvent).not.toHaveBeenCalled();
    expect(policy.getProfile).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('rechecks view consent after construction', async () => {
    let consent: ConsentState = { events: true };
    const policy = owner({ getConsent: () => consent });
    const args = { ...interaction, viewId: 'view', viewDurationMs: 10 };
    const build = vi.fn(() => {
      consent = { events: false };
      return builder.buildView(args);
    });
    const send = vi.fn();

    await expect(emitAnalyticsEvent(policy, 'trackView', args, build, send)).resolves.toEqual({
      accepted: false,
    });
    expect(build).toHaveBeenCalledOnce();
    expect(policy.reportBlockedEvent).toHaveBeenCalledExactlyOnceWith({
      reason: 'consent',
      method: 'trackView',
      args: [args],
    });
    expect(policy.getProfile).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    'stamps current consent %s without mutating the built event',
    async (events) => {
      let consent: ConsentState = { events: !events };
      const policy = owner({ getConsent: () => consent });
      const event = builder.buildPageView();
      const original = globalThis.structuredClone(event);
      const send = vi.fn();

      await emitPersonalizationEvent(
        policy,
        'page',
        {},
        () => {
          consent = { events };
          return event;
        },
        send
      );

      expect(send).toHaveBeenCalledWith({
        ...event,
        context: { ...event.context, gdpr: { isConsentGiven: events } },
      });
      expect(event).toEqual(original);
      expect(send.mock.calls[0]![0]).not.toBe(event);
    }
  );

  it.each([
    ['trackView', 'component'],
    ['trackClick', 'component_click'],
    ['trackHover', 'component_hover'],
    ['trackFlagView', 'flag'],
    ['trackFlagView', 'component'],
  ] as const)('admits %s through %s and refuses unrelated selectors', async (method, selector) => {
    const args = {
      ...interaction,
      viewId: 'view',
      viewDurationMs: 10,
      hoverId: 'hover',
      hoverDurationMs: 10,
      componentId: 'flag',
    };
    const build = () =>
      ({
        trackView: () => builder.buildView(args),
        trackClick: () => builder.buildClick(args),
        trackHover: () => builder.buildHover(args),
        trackFlagView: () => builder.buildFlagView(args),
      })[method]();
    const policy = owner({ getConsent: () => ({}), getAllowedEventTypes: () => [selector] });
    const send = vi.fn();
    await expect(emitAnalyticsEvent(policy, method, args, build, send)).resolves.toEqual({
      accepted: true,
    });
    policy.getAllowedEventTypes = () => ['track'];
    await expect(emitAnalyticsEvent(policy, method, args, build, send)).resolves.toEqual({
      accepted: false,
    });
    expect(send).toHaveBeenCalledOnce();
    expect(policy.reportBlockedEvent).toHaveBeenCalledExactlyOnceWith({
      reason: 'consent',
      method,
      args: [args],
    });
  });

  it.each([{}, { events: false }])(
    'honors a custom Personalization allowlist under consent %j',
    async (consent) => {
      const policy = owner({ getConsent: () => consent, getAllowedEventTypes: () => ['track'] });
      const send = vi.fn().mockResolvedValue({ accepted: true });
      await expect(
        emitPersonalizationEvent(
          policy,
          'track',
          {},
          () => builder.buildTrack({ event: 'purchase' }),
          send
        )
      ).resolves.toEqual({ accepted: true });
      await expect(
        emitPersonalizationEvent(policy, 'page', {}, () => builder.buildPageView(), send)
      ).resolves.toEqual({ accepted: false });
      expect(send).toHaveBeenCalledOnce();
      expect(policy.reportBlockedEvent).toHaveBeenCalledExactlyOnceWith({
        reason: 'consent',
        method: 'page',
        args: [{}],
      });
    }
  );
});

describe('event delivery owners', () => {
  it.each([undefined, { id: 'visitor' }])(
    'delegates incomplete Analytics profile %j to owner policy',
    async (profile) => {
      const policy = owner({ getProfile: () => profile });
      const build = () => builder.buildClick(interaction);
      const send = vi.fn();
      await expect(
        emitAnalyticsEvent(policy, 'trackClick', interaction, build, send)
      ).resolves.toEqual({ accepted: true });
      expect(policy.onMissingProfile).toHaveBeenCalledExactlyOnceWith('trackClick');
      expect(send).not.toHaveBeenCalled();
    }
  );

  it.each([undefined, false] as const)(
    'maps Analytics sender result %s to admission and forwards a validated profile',
    async (result) => {
      const profile = analyticsProfileFixture('visitor');
      const policy = owner({ getProfile: () => profile });
      const event = builder.buildClick(interaction);
      const original = globalThis.structuredClone(event);
      const send = vi.fn().mockResolvedValue(result);

      await expect(
        emitAnalyticsEvent(policy, 'trackClick', interaction, () => event, send)
      ).resolves.toEqual({ accepted: result !== false });
      expect(send).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          context: expect.objectContaining({ gdpr: { isConsentGiven: true } }),
        }),
        profile
      );
      expect(policy.onMissingProfile).not.toHaveBeenCalled();
      expect(event).toEqual(original);
    }
  );
});
