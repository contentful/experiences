import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OptimizationData } from '@contentful/optimization-api-client/api-schemas';
import { logger } from '@contentful/optimization-api-client/logger';

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

  it('admits 100 prepared events and rejects 101 at the shared limit', () => {
    const f = fixture({ online: false });
    const track = builder.buildTrack({ event: 'opened' });
    expect(f.delivery.sendPrepared([...Array(99).fill(track), builder.buildPageView()])).toEqual({
      accepted: true,
    });
    expect(f.delivery.sendPrepared([...Array(100).fill(track), builder.buildPageView()])).toEqual({
      accepted: false,
    });
    expect(f.delivery.queuedEventCount).toBe(100);
    expect(f.upsertProfile).not.toHaveBeenCalled();
  });

  it('keeps the prepared batch limit at 100 while honoring a larger queue capacity', async () => {
    const f = fixture({ online: false, maxEvents: 250 });
    const track = builder.buildTrack({ event: 'queued' });
    const first = [...Array(99).fill(track), builder.buildPageView()];
    expect(f.delivery.sendPrepared(first)).toEqual({ accepted: true });
    await expect(f.delivery.send(track)).resolves.toEqual({ accepted: true });
    expect(f.delivery.sendPrepared([...Array(100).fill(track), builder.buildPageView()])).toEqual({
      accepted: false,
    });
    expect(f.delivery.queuedEventCount).toBe(101);

    f.setOnline(true);
    await f.delivery.flush();
    expect(f.upsertProfile.mock.calls[0]?.[0].events).toEqual(first);
    expect(f.upsertProfile.mock.calls[1]?.[0].events).toEqual([track]);
  });

  it('preserves the accepted FIFO batch when an ordinary event reaches default capacity', async () => {
    const f = fixture({ online: false });
    const track = builder.buildTrack({ event: 'queued' });
    const accepted = [...Array(99).fill(track), builder.buildPageView()];
    expect(f.delivery.sendPrepared(accepted)).toEqual({ accepted: true });
    await expect(f.delivery.send(builder.buildTrack({ event: 'overflow' }))).resolves.toEqual({
      accepted: false,
    });
    expect(f.delivery.queuedEventCount).toBe(100);

    f.setOnline(true);
    await f.delivery.flush();
    expect(f.upsertProfile).toHaveBeenCalledTimes(1);
    expect(f.upsertProfile.mock.calls[0]?.[0].events).toEqual(accepted);
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
      { locale: undefined },
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

  it('refuses an offline ordinary event rather than evicting an accepted prepared batch', async () => {
    const f = fixture({ online: false, maxEvents: 2 });
    const head = prepared();
    expect(f.delivery.sendPrepared(head)).toEqual({ accepted: true });
    expect(f.upsertProfile).not.toHaveBeenCalled();
    const ordinary = builder.buildTrack({ event: 'offline' });
    await expect(f.delivery.send(ordinary)).resolves.toEqual({ accepted: false });
    expect(f.delivery.queuedEventCount).toBe(2);
    f.setOnline(true);
    await f.delivery.flush();
    expect(f.upsertProfile).toHaveBeenCalledExactlyOnceWith(
      { profileId: undefined, events: head },
      { preflight: false, locale: undefined }
    );
  });

  it('refuses a new ordinary event when accepted ordinary events fill the offline queue', async () => {
    const f = fixture({ online: false, maxEvents: 2 });
    const first = builder.buildTrack({ event: 'first' });
    const second = builder.buildTrack({ event: 'second' });
    const third = builder.buildTrack({ event: 'third' });
    await f.delivery.send(first);
    await f.delivery.send(second);
    await expect(f.delivery.send(third)).resolves.toEqual({ accepted: false });

    expect(f.delivery.queuedEventCount).toBe(2);
    f.setOnline(true);
    await f.delivery.flush();
    expect(f.upsertProfile.mock.calls[0]?.[0].events).toEqual([first, second]);
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

  it('joins concurrent and forced flush calls to the active drain until its last batch settles', async () => {
    const firstResponse = deferred<OptimizationData>();
    const secondResponse = deferred<OptimizationData>();
    const f = fixture({ online: false });
    f.upsertProfile
      .mockReturnValueOnce(firstResponse.promise)
      .mockReturnValueOnce(secondResponse.promise);
    expect(f.delivery.sendPrepared(prepared('de-DE'))).toEqual({ accepted: true });
    expect(f.delivery.sendPrepared(prepared('fr-FR'))).toEqual({ accepted: true });

    const drain = f.delivery.flush({ force: true });
    expect(f.delivery.flush()).toBe(drain);
    expect(f.delivery.flush({ force: true })).toBe(drain);
    expect(f.upsertProfile).toHaveBeenCalledTimes(1);

    let settled = false;
    void drain.then(() => {
      settled = true;
    });
    firstResponse.resolve(data('continuation-id'));
    await vi.waitFor(() => expect(f.upsertProfile).toHaveBeenCalledTimes(2));
    expect(settled).toBe(false);
    expect(f.delivery.flush({ force: true })).toBe(drain);
    secondResponse.resolve(data('continuation-id'));
    await drain;
    expect(settled).toBe(true);
    expect(f.delivery.queuedEventCount).toBe(0);
  });

  it('settles a failed flush while its retry is still scheduled', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const f = fixture({ online: false });
    f.upsertProfile.mockRejectedValueOnce(new Error('network'));
    expect(f.delivery.sendPrepared(prepared())).toEqual({ accepted: true });

    await f.delivery.flush({ force: true });
    expect(f.delivery.state).toEqual({ status: 'failed', reason: 'api-error' });
    expect(f.delivery.queuedEventCount).toBe(2);
    expect(f.upsertProfile).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    f.delivery.reset();
  });

  it('keeps a stale reset attempt from consuming or publishing replacement work', async () => {
    const staleResponse = deferred<OptimizationData>();
    const replacementResponse = deferred<OptimizationData>();
    const f = fixture({ online: false });
    f.upsertProfile
      .mockReturnValueOnce(staleResponse.promise)
      .mockReturnValueOnce(replacementResponse.promise);
    expect(f.delivery.sendPrepared(prepared('de-DE'))).toEqual({ accepted: true });
    const staleDrain = f.delivery.flush({ force: true });
    f.delivery.reset();

    const replacement = prepared('fr-FR');
    expect(f.delivery.sendPrepared(replacement)).toEqual({ accepted: true });
    const replacementDrain = f.delivery.flush({ force: true });
    expect(f.upsertProfile).toHaveBeenCalledTimes(2);
    staleResponse.resolve(data('stale-id'));
    await staleDrain;
    expect(f.delivery.queuedEventCount).toBe(replacement.length);
    expect(f.publishQueuedData).not.toHaveBeenCalled();
    expect(f.delivery.flush({ force: true })).toBe(replacementDrain);

    replacementResponse.resolve(data('replacement-id'));
    await replacementDrain;
    expect(f.delivery.queuedEventCount).toBe(0);
    expect(f.publishQueuedData).toHaveBeenCalledExactlyOnceWith(data('replacement-id'));
  });

  it('keeps retry body, IDs, target, and absent locale stable after a failure', async () => {
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
    expect(firstCall?.[1]).toEqual({ preflight: false, locale: undefined });
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
      { preflight: false, locale: undefined }
    );
    pending.resolve(data('late-profile'));
    await vi.waitFor(() => expect(f.delivery.queuedEventCount).toBe(0));
    expect(f.publishQueuedData).not.toHaveBeenCalled();
    expect(f.delivery.state).toEqual({ status: 'idle' });
  });

  it('attempts every queued batch in order on destroy and carries the response profile ID', async () => {
    const firstResponse = deferred<OptimizationData>();
    const f = fixture({ online: false });
    f.upsertProfile.mockReturnValueOnce(firstResponse.promise);
    const first = prepared('de-DE');
    const second = prepared('fr-FR');
    expect(f.delivery.sendPrepared(first, { locale: 'de-DE' })).toEqual({ accepted: true });
    expect(f.delivery.sendPrepared(second, { locale: 'fr-FR' })).toEqual({ accepted: true });

    f.delivery.destroy();
    expect(f.upsertProfile).toHaveBeenCalledTimes(1);
    expect(f.delivery.sendPrepared(prepared())).toEqual({ accepted: false });
    await expect(f.delivery.send(builder.buildTrack({ event: 'late' }))).resolves.toEqual({
      accepted: false,
    });

    firstResponse.resolve(data('continuation-id'));
    await vi.waitFor(() => expect(f.upsertProfile).toHaveBeenCalledTimes(2));
    expect(f.upsertProfile.mock.calls[1]).toEqual([
      { profileId: 'continuation-id', events: second },
      { preflight: false, locale: 'fr-FR' },
    ]);
    await vi.waitFor(() => expect(f.delivery.queuedEventCount).toBe(0));
    expect(f.publishQueuedData).not.toHaveBeenCalled();
    expect(f.delivery.state).toEqual({ status: 'idle' });
  });

  it('continues an active flush on destroy without publishing late responses', async () => {
    const firstResponse = deferred<OptimizationData>();
    const f = fixture();
    f.upsertProfile.mockReturnValueOnce(firstResponse.promise);
    const first = prepared('de-DE');
    const second = prepared('fr-FR');
    expect(f.delivery.sendPrepared(first, { locale: 'de-DE' })).toEqual({ accepted: true });
    expect(f.delivery.sendPrepared(second, { locale: 'fr-FR' })).toEqual({ accepted: true });

    f.delivery.destroy();
    firstResponse.resolve(data('continuation-id'));
    await vi.waitFor(() => expect(f.upsertProfile).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(f.delivery.queuedEventCount).toBe(0));
    expect(f.publishQueuedData).not.toHaveBeenCalled();
  });

  it('cancels the remaining destroy drain when reset follows destroy', async () => {
    const firstResponse = deferred<OptimizationData>();
    const f = fixture({ online: false });
    f.upsertProfile.mockReturnValueOnce(firstResponse.promise);
    expect(f.delivery.sendPrepared(prepared('de-DE'))).toEqual({ accepted: true });
    expect(f.delivery.sendPrepared(prepared('fr-FR'))).toEqual({ accepted: true });

    f.delivery.destroy();
    const drain = f.delivery.flush();
    expect(f.upsertProfile).toHaveBeenCalledTimes(1);
    f.delivery.reset();
    expect(f.delivery.queuedEventCount).toBe(0);

    firstResponse.resolve(data('late-profile'));
    await drain;
    expect(f.upsertProfile).toHaveBeenCalledTimes(1);
    expect(f.publishQueuedData).not.toHaveBeenCalled();
    expect(f.delivery.state).toEqual({ status: 'idle' });
    expect(f.delivery.sendPrepared(prepared())).toEqual({ accepted: false });
  });

  it('stops a failed destroy drain without retrying or publishing', async () => {
    vi.useFakeTimers();
    const f = fixture({ online: false });
    f.upsertProfile.mockRejectedValueOnce(new Error('network'));
    const ingest = vi.fn();
    const sink = { name: 'personalization-delivery-test', ingest };
    logger.addSink(sink);
    expect(f.delivery.sendPrepared(prepared())).toEqual({ accepted: true });
    expect(f.delivery.sendPrepared(prepared())).toEqual({ accepted: true });

    try {
      f.delivery.destroy();
      await vi.runAllTimersAsync();
      expect(f.upsertProfile).toHaveBeenCalledTimes(1);
      expect(f.delivery.queuedEventCount).toBe(0);
      expect(f.delivery.state).toEqual({ status: 'idle' });
      expect(vi.getTimerCount()).toBe(0);
      expect(ingest).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'warn',
          messages: expect.arrayContaining([
            expect.stringContaining('Personalization queue flush request failed'),
          ]),
        })
      );
      expect(JSON.stringify(ingest.mock.calls)).not.toContain('opened');
    } finally {
      logger.removeSink(sink.name);
    }
  });
});
