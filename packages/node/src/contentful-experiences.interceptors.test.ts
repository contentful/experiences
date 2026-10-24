import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContentfulExperiences, type ExperiencesNodeConfig } from './contentful-experiences.js';
import type { OptimizationEventStreamEvent } from './index.js';

const instances: ContentfulExperiences[] = [];
const resolver = { config: { components: {} } };
function setup(policy: Pick<ExperiencesNodeConfig, 'allowedEventTypes' | 'onEventBlocked'> = {}) {
  const sdk = new ContentfulExperiences({
    spaceId: 'space',
    environmentId: 'env',
    delivery: { accessToken: 'token' },
    ...policy,
  });
  instances.push(sdk);
  const upsert = vi
    .spyOn(sdk.api.experience, 'upsertProfile')
    .mockResolvedValue({ profile: { id: 'response' } } as never);
  const analytics = vi.spyOn(sdk.api.insights, 'sendBatchEvents').mockResolvedValue(true);
  return { sdk, upsert, analytics };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
afterEach(() => {
  for (const sdk of instances) sdk.destroy();
  instances.length = 0;
  vi.restoreAllMocks();
});

describe('Node event interceptors', () => {
  it('shares its instance registry across request facades', async () => {
    const { sdk, upsert } = setup();
    const other = setup();
    const hook = vi.fn((event: OptimizationEventStreamEvent) => event);
    sdk.interceptors.event.add(hook);
    await sdk.forRequest({ consent: true }).page();
    await sdk.forRequest({ consent: true }).page();
    await other.sdk.forRequest({ consent: true }).page();
    expect(hook).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it('intercepts direct Personalization and Analytics once on their original transports', async () => {
    const { sdk, upsert, analytics } = setup();
    const hook = vi.fn((event: OptimizationEventStreamEvent) => {
      event.context.userAgent = 'normalized';
      return event;
    });
    sdk.interceptors.event.add(hook);
    const request = sdk.forRequest({ consent: true, profile: { id: 'visitor' } });
    await request.page();
    await request.trackClick({ entityId: 'entity', entityKind: 'Experience' });
    expect(hook).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[0]?.[0].events[0]?.context.userAgent).toBe('normalized');
    expect(analytics.mock.calls[0]?.[0][0]?.events[0]?.context.userAgent).toBe('normalized');
  });

  it('isolates concurrent request identities/context despite one shared asynchronous hook', async () => {
    const { sdk, upsert } = setup();
    sdk.interceptors.event.add(async (event) => {
      await Promise.resolve();
      return event;
    });
    const a = sdk.forRequest({
      consent: true,
      profile: { id: 'a' },
      eventContext: { userAgent: 'agent-a' },
    });
    const b = sdk.forRequest({
      consent: true,
      profile: { id: 'b' },
      eventContext: { userAgent: 'agent-b' },
    });
    await Promise.all([a.page(), b.page()]);
    expect(
      upsert.mock.calls.map(([body]) => [body.profileId, body.events[0]?.context.userAgent])
    ).toEqual([
      ['a', 'agent-a'],
      ['b', 'agent-b'],
    ]);
  });

  it.each(['xda', 'prepared'] as const)(
    'captures %s identity and revision before asynchronous interception',
    async (operation) => {
      const { sdk, upsert } = setup();
      const hold = deferred();
      sdk.interceptors.event.add(async (event) => {
        if (event.type === 'page') await hold.promise;
        return event;
      });
      const fetch = vi.spyOn(sdk, 'fetchExperience').mockResolvedValue({
        nodes: [],
        personalization: { profileId: 'stale' },
      } as never);
      const request = sdk.forRequest({ consent: true, profile: { id: 'initial' } });
      const pending =
        operation === 'prepared'
          ? request.prepareRequestHandoff({ routeKey: '/' })
          : request.fetchExperience(
              {
                experienceId: 'exp',
                personalization: { events: [sdk.eventBuilder.buildPageView()] },
              },
              resolver
            );
      await request.identify({ userId: 'new' });
      upsert.mockResolvedValueOnce({ profile: { id: 'stale' } } as never);
      hold.resolve();
      const result = await pending;
      if (operation === 'xda') {
        expect(fetch.mock.calls[0]?.[0].personalization?.profileId).toBe('initial');
      } else {
        expect(upsert.mock.calls[1]?.[0].profileId).toBe('initial');
        expect(result).toMatchObject({ handoff: { profileId: 'initial' } });
      }
      expect(request.profile?.id).toBe('response');
    }
  );

  it('passes concurrent XDA hook results to its fetch path', async () => {
    const { sdk, upsert, analytics } = setup();
    const fetch = vi.spyOn(sdk, 'fetchExperience').mockResolvedValue({ nodes: [] } as never);
    const hold = deferred();
    const started: [string, string | undefined][] = [];
    sdk.interceptors.event.add(async (event) => {
      started.push([event.type, event.context.userAgent]);
      if (event.type === 'identify') await hold.promise;
      event.context.userAgent = 'hook';
      return event;
    });
    const request = sdk.forRequest({ consent: true, eventContext: { userAgent: 'request-agent' } });
    const events = [
      request.eventBuilder.buildIdentify({ userId: 'user' }),
      request.eventBuilder.buildPageView(),
    ];
    expect(started).toEqual([]);
    expect(upsert).not.toHaveBeenCalled();
    expect(analytics).not.toHaveBeenCalled();
    const pending = request.fetchExperience(
      { experienceId: 'exp', personalization: { events } },
      resolver
    );
    expect(started).toEqual([
      ['identify', 'request-agent'],
      ['page', 'request-agent'],
    ]);
    expect(fetch).not.toHaveBeenCalled();
    hold.resolve();
    await pending;
    const sent = fetch.mock.calls[0]?.[0].personalization?.events;
    expect(sent?.map((event) => event.type)).toEqual(['identify', 'page']);
    expect(sent?.[0]?.context).toMatchObject({ userAgent: 'hook' });
  });

  it('keeps XDA profile/content fetch while dropping original and transformed blocked events', async () => {
    const onEventBlocked = vi.fn();
    const { sdk } = setup({ onEventBlocked });
    const fetch = vi.spyOn(sdk, 'fetchExperience').mockResolvedValue({ nodes: [] } as never);
    const hook = vi.fn(() => sdk.eventBuilder.buildTrack({ event: 'restricted' }));
    sdk.interceptors.event.add(hook);
    await sdk.forRequest({ consent: false, profile: { id: 'visitor' } }).fetchExperience(
      {
        experienceId: 'exp',
        personalization: {
          events: [
            sdk.eventBuilder.buildPageView(),
            sdk.eventBuilder.buildTrack({ event: 'blocked' }),
          ],
        },
      },
      resolver
    );
    expect(hook).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0].personalization).toEqual({ profileId: 'visitor', events: [] });
    expect(onEventBlocked).toHaveBeenCalledTimes(2);
  });

  it('rejects invalid XDA hook output before final consent and transport', async () => {
    const onEventBlocked = vi.fn();
    const { sdk } = setup({ onEventBlocked });
    const fetch = vi.spyOn(sdk, 'fetchExperience').mockResolvedValue({ nodes: [] } as never);
    sdk.interceptors.event.add(() => ({ type: 'track' }) as never);
    await expect(
      sdk
        .forRequest()
        .fetchExperience(
          { experienceId: 'exp', personalization: { events: [sdk.eventBuilder.buildPageView()] } },
          resolver
        )
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    expect(onEventBlocked).not.toHaveBeenCalled();
  });
});

describe('Node prepared event interception', () => {
  it('runs prepared hooks sequentially and retains the exact transformed replay after preflight failure', async () => {
    const { sdk, upsert } = setup();
    const hold = deferred();
    const seen: string[] = [];
    sdk.interceptors.event.add(async (event) => {
      seen.push(event.type);
      if (event.type === 'identify') await hold.promise;
      event.context.userAgent = 'prepared';
      return event;
    });
    upsert.mockRejectedValueOnce(new Error('offline'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pending = sdk.forRequest({ consent: true }).prepareRequestHandoff({
      routeKey: '/',
      initialEvents: [
        { type: 'identify', userId: 'user' },
        { type: 'track', event: 'prefix' },
      ],
    });
    expect(seen).toEqual(['identify']);
    hold.resolve();
    const result = await pending;
    expect(seen).toEqual(['identify', 'track', 'page']);
    expect(result.data).toBeUndefined();
    expect(result.handoff.replay?.events).toEqual(upsert.mock.calls[0]?.[0].events);
    expect(
      result.handoff.replay?.events.every((event) => event.context.userAgent === 'prepared')
    ).toBe(true);
  });

  it('omits only transformed blocked optional prefixes and still previews the valid final page', async () => {
    const onEventBlocked = vi.fn();
    const { sdk, upsert } = setup({ onEventBlocked });
    sdk.interceptors.event.add((event) =>
      event.type === 'identify' ? sdk.eventBuilder.buildTrack({ event: 'blocked' }) : event
    );
    const result = await sdk.forRequest({ consent: false }).prepareRequestHandoff({
      routeKey: '/',
      initialEvents: [{ type: 'identify', userId: 'user' }],
    });
    expect(result.handoff.replay?.events.map((event) => event.type)).toEqual(['page']);
    expect(upsert).toHaveBeenCalledOnce();
    expect(onEventBlocked).toHaveBeenCalledWith(expect.objectContaining({ method: 'track' }));
  });

  it.each(['blocked-final', 'invalid-final', 'invalid-prefix', 'throw'])(
    'uses event-free fallback for %s',
    async (kind) => {
      const { sdk, upsert } = setup();
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      sdk.interceptors.event.add((event) => {
        if (kind === 'throw') throw new Error('hook failed');
        if (kind === 'invalid-prefix' && event.type === 'identify')
          return sdk.eventBuilder.buildPageView();
        if (kind === 'invalid-final' && event.type === 'page')
          return sdk.eventBuilder.buildIdentify({ userId: 'wrong-final' });
        if (kind === 'blocked-final' && event.type === 'page')
          return sdk.eventBuilder.buildTrack({ event: 'blocked' });
        return event;
      });
      const result = await sdk.forRequest({ consent: false }).prepareRequestHandoff({
        routeKey: '/',
        initialEvents: [{ type: 'identify', userId: 'user' }],
      });
      expect(result.handoff.replay).toBeUndefined();
      expect(result.data).toBeUndefined();
      expect(upsert).not.toHaveBeenCalled();
    }
  );
});
