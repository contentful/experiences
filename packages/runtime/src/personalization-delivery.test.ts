import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OptimizationData } from '@contentful/optimization-api-client/api-schemas';

import EventBuilder from './event-builder.js';
import { PersonalizationDelivery } from './personalization-delivery.js';
import { buildPreparedEvents } from './prepared-events.js';
import type { RuntimeOptimizationApiClient } from './runtime-event-methods.js';

const builder = new EventBuilder({
  channel: 'web',
  library: { name: '@contentful/experiences-web', version: 'test' },
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function data(id: string): OptimizationData {
  return { profile: { id }, changes: [], selectedOptimizations: [] } as unknown as OptimizationData;
}

function fixture(options: { online?: boolean; profileId?: string; maxEvents?: number } = {}) {
  let online = options.online ?? true;
  let profileId = options.profileId;
  let revision = 0;
  const upsertProfile = vi
    .fn<RuntimeOptimizationApiClient['personalization']['upsertProfile']>()
    .mockResolvedValue(data('response-id'));
  const publishQueuedData = vi.fn();
  const delivery = new PersonalizationDelivery({
    api: { upsertProfile },
    getProfileId: () => profileId,
    getProfileRevision: () => revision,
    getOnline: () => online,
    publishQueuedData,
    maxEvents: options.maxEvents,
  });
  return {
    delivery,
    upsertProfile,
    publishQueuedData,
    setOnline: (value: boolean) => {
      online = value;
    },
    setProfile: (value: string | undefined) => {
      profileId = value;
      revision++;
    },
  };
}

function prepared(locale = 'de-DE') {
  return buildPreparedEvents({
    eventBuilder: builder,
    eventContext: { locale },
    initialEvents: [{ type: 'track', event: 'opened' }],
    eventConsent: true,
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('PersonalizationDelivery', () => {
  it('admits a prepared batch before HTTP settles and preserves the exact events and GDPR metadata', async () => {
    const response = deferred<OptimizationData>();
    const f = fixture({ profileId: 'profile-1' });
    f.upsertProfile.mockReturnValueOnce(response.promise);
    const events = prepared();

    expect(f.delivery.sendPrepared(events, { locale: 'fr-FR' })).toEqual({ accepted: true });
    expect(f.delivery.state.status).toBe('pending');
    expect(f.upsertProfile).toHaveBeenCalledWith(
      { profileId: 'profile-1', events },
      { preflight: false, locale: 'fr-FR' }
    );
    expect(f.upsertProfile.mock.calls[0]?.[0].events.map((event) => event.messageId)).toEqual(
      events.map((event) => event.messageId)
    );
    expect(
      f.upsertProfile.mock.calls[0]?.[0].events.every((event) => event.context.gdpr?.isConsentGiven)
    ).toBe(true);
    expect(f.publishQueuedData).not.toHaveBeenCalled();

    response.resolve(data('profile-1'));
    await vi.waitFor(() => expect(f.delivery.queuedEventCount).toBe(0));
    expect(f.publishQueuedData).toHaveBeenCalledWith(data('profile-1'));
  });

  it('refuses a valid prepared batch exceeding capacity without sending a prefix', () => {
    const f = fixture({ maxEvents: 2 });
    expect(prepared()).toHaveLength(2);
    expect(f.delivery.sendPrepared(prepared())).toEqual({ accepted: true });
    expect(f.delivery.sendPrepared(prepared())).toEqual({ accepted: false });
    expect(f.delivery.queuedEventCount).toBe(2);
    expect(f.upsertProfile).toHaveBeenCalledTimes(1);
  });

  it('uses a 100-event default even though prepared validation permits 200', () => {
    const f = fixture();
    const oversized = [
      ...Array(100).fill(builder.buildTrack({ event: 'opened' })),
      builder.buildPageView(),
    ];
    expect(f.delivery.sendPrepared(oversized)).toEqual({ accepted: false });
    expect(f.delivery.queuedEventCount).toBe(0);
    expect(f.upsertProfile).not.toHaveBeenCalled();
  });

  it('keeps distinct prepared batches ordered and lets an online ordinary event send directly', async () => {
    const firstResponse = deferred<OptimizationData>();
    const f = fixture({ profileId: 'profile-1' });
    f.upsertProfile.mockReturnValueOnce(firstResponse.promise);
    const first = prepared('de-DE');
    const second = prepared('fr-FR');
    expect(f.delivery.sendPrepared(first, { locale: 'de-DE' })).toEqual({ accepted: true });
    expect(f.delivery.sendPrepared(second, { locale: 'fr-FR' })).toEqual({ accepted: true });
    const ordinary = builder.buildTrack({ event: 'ordinary', locale: 'it-IT' });

    await expect(f.delivery.send(ordinary)).resolves.toMatchObject({ accepted: true });
    expect(f.upsertProfile).toHaveBeenCalledTimes(2);
    expect(f.upsertProfile.mock.calls[1]).toEqual([
      { profileId: 'profile-1', events: [ordinary] },
      { locale: 'it-IT' },
    ]);
    firstResponse.resolve(data('profile-1'));
    await vi.waitFor(() => expect(f.upsertProfile).toHaveBeenCalledTimes(3));
    expect(f.upsertProfile.mock.calls[2]).toEqual([
      { profileId: 'profile-1', events: second },
      { preflight: false, locale: 'fr-FR' },
    ]);
  });

  it('rejects a failed direct online event instead of reporting admission', async () => {
    const f = fixture();
    const failure = new Error('network');
    f.upsertProfile.mockRejectedValueOnce(failure);
    await expect(f.delivery.send(builder.buildPageView())).rejects.toBe(failure);
    expect(f.delivery.queuedEventCount).toBe(0);
    expect(f.delivery.state).toEqual({ status: 'failed', reason: 'api-error' });
  });

  it('classifies an aborted transport as a timeout without queueing the direct event', async () => {
    const f = fixture();
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    f.upsertProfile.mockRejectedValueOnce(abort);

    await expect(f.delivery.send(builder.buildPageView())).rejects.toBe(abort);
    expect(f.delivery.state).toEqual({ status: 'failed', reason: 'timeout' });
    expect(f.delivery.queuedEventCount).toBe(0);
  });

  it('evicts a whole prepared head when an offline ordinary event overflows capacity', async () => {
    const f = fixture({ online: false, maxEvents: 2 });
    const head = prepared();
    expect(f.delivery.sendPrepared(head)).toEqual({ accepted: true });
    expect(f.upsertProfile).not.toHaveBeenCalled();
    const ordinary = builder.buildTrack({ event: 'offline' });
    await expect(f.delivery.send(ordinary)).resolves.toEqual({ accepted: true });
    expect(f.delivery.queuedEventCount).toBe(1);
    f.setOnline(true);
    await f.delivery.flush();
    expect(f.upsertProfile).toHaveBeenCalledExactlyOnceWith(
      { profileId: undefined, events: [ordinary] },
      { locale: ordinary.context.locale }
    );
  });

  it('drops the oldest ordinary offline event while retaining newer ordinary events', async () => {
    const f = fixture({ online: false, maxEvents: 2 });
    const first = builder.buildTrack({ event: 'first' });
    const second = builder.buildTrack({ event: 'second' });
    const third = builder.buildTrack({ event: 'third' });
    await f.delivery.send(first);
    await f.delivery.send(second);
    await f.delivery.send(third);

    expect(f.delivery.queuedEventCount).toBe(2);
    f.setOnline(true);
    await f.delivery.flush();
    expect(f.upsertProfile.mock.calls[0]?.[0].events).toEqual([second, third]);
  });

  it('reconciles an in-flight ordinary snapshot without dropping events appended during the request', async () => {
    const response = deferred<OptimizationData>();
    const f = fixture({ online: false });
    const first = builder.buildTrack({ event: 'first' });
    const second = builder.buildTrack({ event: 'second' });
    await f.delivery.send(first);
    f.setOnline(true);
    f.upsertProfile.mockReturnValueOnce(response.promise);
    const flush = f.delivery.flush();
    f.setOnline(false);
    await f.delivery.send(second);
    expect(f.upsertProfile).toHaveBeenCalledTimes(1);
    response.resolve(data('profile-1'));
    await flush;
    expect(f.upsertProfile.mock.calls[1]?.[0].events).toEqual([second]);
    expect(f.delivery.queuedEventCount).toBe(0);
  });

  it('keeps retry body, IDs, target, and empty-locale fallback stable after a failure', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const f = fixture({ profileId: 'original' });
    f.upsertProfile.mockRejectedValueOnce(new Error('network'));
    const events = prepared();
    expect(f.delivery.sendPrepared(events)).toEqual({ accepted: true });
    await vi.waitFor(() => expect(f.delivery.state.status).toBe('failed'));
    const firstCall = f.upsertProfile.mock.calls[0];
    f.setProfile('later');
    await vi.advanceTimersByTimeAsync(500);
    expect(f.upsertProfile).toHaveBeenCalledTimes(2);
    expect(f.upsertProfile.mock.calls[1]).toEqual(firstCall);
    expect(firstCall?.[1]).toEqual({ preflight: false, locale: '' });
    expect(f.delivery.queuedEventCount).toBe(0);
  });

  it('uses the first response ID for a second batch without a captured ID', async () => {
    const response = deferred<OptimizationData>();
    const f = fixture();
    f.upsertProfile.mockReturnValueOnce(response.promise);
    expect(f.delivery.sendPrepared(prepared())).toEqual({ accepted: true });
    expect(f.delivery.sendPrepared(prepared())).toEqual({ accepted: true });
    response.resolve(data('new-id'));
    await vi.waitFor(() => expect(f.upsertProfile).toHaveBeenCalledTimes(2));
    expect(f.upsertProfile.mock.calls[1]?.[0].profileId).toBe('new-id');
  });

  it.each(['reset', 'destroy'] as const)(
    '%s prevents stale in-flight publication and retries',
    async (action) => {
      vi.useFakeTimers();
      const response = deferred<OptimizationData>();
      const f = fixture();
      f.upsertProfile.mockReturnValueOnce(response.promise);
      expect(f.delivery.sendPrepared(prepared())).toEqual({ accepted: true });
      f.delivery[action]();
      response.resolve(data('stale'));
      await vi.runAllTimersAsync();
      expect(f.publishQueuedData).not.toHaveBeenCalled();
      expect(f.delivery.state).toEqual({ status: 'idle' });
      expect(f.delivery.queuedEventCount).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
      if (action === 'destroy')
        expect(f.delivery.sendPrepared(prepared())).toEqual({ accepted: false });
    }
  );

  it('force-flushes offline prepared work on destroy without publishing its late response', async () => {
    const pending = deferred<OptimizationData>();
    const f = fixture({ online: false });
    f.upsertProfile.mockReturnValueOnce(pending.promise);
    const events = prepared();
    expect(f.delivery.sendPrepared(events)).toEqual({ accepted: true });
    expect(f.upsertProfile).not.toHaveBeenCalled();

    f.delivery.destroy();
    expect(f.upsertProfile).toHaveBeenCalledExactlyOnceWith(
      { profileId: undefined, events },
      { preflight: false, locale: '' }
    );
    pending.resolve(data('late-profile'));
    await Promise.resolve();
    await Promise.resolve();
    expect(f.publishQueuedData).not.toHaveBeenCalled();
    expect(f.delivery.state).toEqual({ status: 'idle' });
  });
});
