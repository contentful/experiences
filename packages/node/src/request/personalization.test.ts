import { describe, expect, it, vi } from 'vitest';
import { EventBuilder } from '@contentful/experiences-runtime';
import { RequestPersonalization } from './personalization.js';
import { InterceptorManager } from '@contentful/experiences-runtime';

const builder = new EventBuilder({ channel: 'server', library: { name: 'test', version: '1' } });
describe('request personalization', () => {
  it.each([
    { events: false, profileId: 'p' },
    { events: false, profileId: undefined },
    { events: true, profileId: undefined },
  ])(
    'filters caller-built events with consent $events and profile $profileId',
    ({ events, profileId }) => {
      const onEventBlocked = vi.fn();
      const page = builder.buildPageView();
      const track = builder.buildTrack({ event: 'purchase' });
      const original = globalThis.structuredClone(track);
      const consent = { events };
      const owner = new RequestPersonalization({
        locale: undefined,
        isPreview: false,
        eventBuilder: builder,
        consent,
        consentPolicy: { onEventBlocked },
        getProfile: () => undefined,
        getInterceptors: () => new InterceptorManager(),
        assertActive: () => {},
      });
      const gated = owner.gate({
        personalization: events
          ? { events: [track] }
          : { ...(profileId === undefined ? {} : { profileId }), events: [page, track] },
      });
      const result = owner.finalize(gated);
      const stamp = <T extends typeof page | typeof track>(event: T) => ({
        ...event,
        context: { ...event.context, gdpr: { isConsentGiven: events } },
      });
      expect(result.personalization).toEqual({
        ...(profileId === undefined ? {} : { profileId }),
        events: events ? [stamp(track)] : [page],
      });
      if (!events)
        expect(onEventBlocked).toHaveBeenCalledWith(
          expect.objectContaining({ reason: 'consent', method: 'track' })
        );
      expect(track).toEqual(original);
      expect(track.context.gdpr?.isConsentGiven).toBe(false);
    }
  );

  it('validates transformed output before final consent admission', () => {
    const onEventBlocked = vi.fn();
    const owner = new RequestPersonalization({
      locale: undefined,
      isPreview: false,
      eventBuilder: builder,
      consent: { events: false },
      consentPolicy: { allowedEventTypes: [], onEventBlocked },
      getProfile: () => undefined,
      getInterceptors: () => new InterceptorManager(),
      assertActive: () => {},
    });
    const options = { personalization: { events: [builder.buildPageView()] } };
    for (const invalid of [
      { type: 'track' },
      { ...options.personalization.events[0], context: null },
    ]) {
      expect(() => owner.finalize(options, { events: [invalid] })).toThrow();
      expect(onEventBlocked).not.toHaveBeenCalled();
    }
  });

  it('drops and reports preview intent before building', () => {
    const buildPageView = vi.spyOn(builder, 'buildPageView');
    const onEventBlocked = vi.fn();
    const owner = new RequestPersonalization({
      locale: 'de-DE',
      isPreview: true,
      eventBuilder: builder,
      consent: {},
      consentPolicy: { onEventBlocked },
      getProfile: () => ({ id: 'visitor' }),
      getInterceptors: () => new InterceptorManager(),
      assertActive: () => {},
    });
    const input = { personalization: { events: [{ type: 'page' as const }] } };
    expect(owner.gate(input)).toEqual({ locale: 'de-DE', personalization: undefined });
    expect(onEventBlocked).toHaveBeenCalledExactlyOnceWith({
      reason: 'preview',
      method: 'page',
      args: [input.personalization.events[0]],
    });
    expect(buildPageView).not.toHaveBeenCalled();
    buildPageView.mockRestore();
  });
});

function setup(consent = { events: true }, policy = {}) {
  const interceptors = new InterceptorManager<
    import('@contentful/experiences-runtime').OptimizationEventStreamEvent
  >();
  const assertActive = vi.fn();
  const owner = new RequestPersonalization({
    locale: 'de-DE',
    isPreview: false,
    eventBuilder: builder,
    consent,
    consentPolicy: policy,
    getProfile: () => ({ id: 'visitor' }),
    getInterceptors: () => interceptors,
    assertActive,
  });
  return { owner, interceptors, assertActive };
}

describe('request event preparation', () => {
  it('builds native arguments once, retains raw intent, and leaves caller input unchanged', async () => {
    const { owner, interceptors } = setup();
    const raw = builder.buildTrack({ event: 'raw' });
    const events = [
      { type: 'identify', userId: 'user' },
      { type: 'track', event: 'native' },
      { type: 'page', properties: { url: 'https://example.test/home' } },
      raw,
    ] satisfies NonNullable<
      import('@contentful/experiences-runtime').PersonalizationOptions['events']
    >;
    const original = globalThis.structuredClone(events);
    const builders = [
      vi.spyOn(builder, 'buildIdentify'),
      vi.spyOn(builder, 'buildTrack'),
      vi.spyOn(builder, 'buildPageView'),
    ];
    const hook = vi.fn(
      (event: import('@contentful/experiences-runtime').OptimizationEventStreamEvent) => event
    );
    interceptors.add(hook);
    const result = await owner.intercept(owner.gate({ personalization: { events } }));
    for (const spy of builders) {
      expect(spy).toHaveBeenCalledOnce();
      spy.mockRestore();
    }
    expect(hook).toHaveBeenCalledTimes(events.length);
    expect(result.personalization?.profileId).toBe('visitor');
    expect(result.personalization?.events?.map((event) => event.type)).toEqual([
      'identify',
      'track',
      'page',
      'track',
    ]);
    expect(result.personalization?.events?.[3]).toEqual({
      ...raw,
      context: { ...raw.context, gdpr: { ...raw.context.gdpr, isConsentGiven: true } },
    });
    expect(events).toEqual(original);
  });

  it('starts ordinary XDA hooks concurrently and preserves event order and transformed metadata', async () => {
    const { owner, interceptors, assertActive } = setup();
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started: [string, string | undefined][] = [];
    interceptors.add(async (event) => {
      started.push([event.type, event.context.userAgent]);
      expect(event.context).toMatchObject({ gdpr: { isConsentGiven: true } });
      if (event.type === 'identify') await hold;
      event.context.userAgent = 'hook';
      Object.assign(event.context, { gdpr: { isConsentGiven: false } });
      return event;
    });
    const events = [
      builder.buildIdentify({ userId: 'user', userAgent: 'request-agent' }),
      builder.buildPageView({ userAgent: 'request-agent' }),
    ];
    Object.assign(events[0]!.context.gdpr!, { isConsentGiven: 'yes' });
    const original = globalThis.structuredClone(events);
    const pending = owner.intercept(owner.gate({ personalization: { events } }));
    expect(started).toEqual([
      ['identify', 'request-agent'],
      ['page', 'request-agent'],
    ]);
    expect(assertActive).not.toHaveBeenCalled();
    release();
    const sent = (await pending).personalization?.events;
    expect(sent?.map((event) => event.type)).toEqual(['identify', 'page']);
    expect(sent?.[0]).toMatchObject({
      context: { userAgent: 'hook', gdpr: { isConsentGiven: false } },
    });
    expect(events).toEqual(original);
    expect(assertActive).toHaveBeenCalledOnce();
  });

  it('drops blocked original and transformed events while retaining profile and fetch options', async () => {
    const onEventBlocked = vi.fn();
    const { owner, interceptors } = setup({ events: false }, { onEventBlocked });
    const hook = vi.fn(() => builder.buildTrack({ event: 'restricted' }));
    interceptors.add(hook);
    const input = {
      experienceId: 'exp',
      personalization: {
        events: [builder.buildPageView(), builder.buildTrack({ event: 'blocked' })],
      },
    };
    const result = await owner.intercept(owner.gate(input));
    expect(result).toMatchObject({
      experienceId: 'exp',
      locale: 'de-DE',
      personalization: { profileId: 'visitor', events: [] },
    });
    expect(hook).toHaveBeenCalledOnce();
    expect(onEventBlocked).toHaveBeenCalledTimes(2);
  });

  it('rejects invalid intercepted output before final consent callbacks', async () => {
    const onEventBlocked = vi.fn();
    const { owner, interceptors } = setup({ events: false }, { onEventBlocked });
    const hook = vi.fn(() => ({ type: 'track' }) as never);
    interceptors.add(hook);
    await expect(
      owner.intercept(
        owner.gate({
          personalization: {
            events: [builder.buildPageView()],
          },
        })
      )
    ).rejects.toThrow();
    expect(hook).toHaveBeenCalledOnce();
    expect(onEventBlocked).not.toHaveBeenCalled();
  });
});
