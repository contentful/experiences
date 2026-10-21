import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OptimizationData } from '@contentful/optimization-api-client/api-schemas';
import { logger } from '@contentful/optimization-api-client/logger';

import EventBuilder from './event-builder.js';
import type { ExperienceRequestState } from './experience-request-state.js';
import type { EventInterceptors } from './event-interceptors.js';
import { PersonalizationDelivery } from './personalization-delivery.js';
import { resolveQueueFlushPolicy } from './lib/queue/index.js';
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

function fixture(
  options: {
    online?: boolean;
    profileId?: string;
    maxEvents?: number;
    experienceRequestState?: { value: ExperienceRequestState };
  } = {}
) {
  let online = options.online ?? true;
  let profileId = options.profileId;
  let revision = 0;
  const upsertProfile = vi
    .fn<RuntimeOptimizationApiClient['experience']['upsertProfile']>()
    .mockResolvedValue(data('response-id'));
  const experienceRequestState: { value: ExperienceRequestState } =
    options.experienceRequestState ?? { value: { status: 'idle' } };
  const applyOptimizationData = vi.fn<
    (data: OptimizationData, isCurrent: () => boolean) => void | Promise<void>
  >(() => {
    experienceRequestState.value = { status: 'success' };
  });
  const eventInterceptors = { run: vi.fn<EventInterceptors['run']>(async (event) => event) };
  const publishEvent = vi.fn();
  const delivery = new PersonalizationDelivery({
    api: { upsertProfile },
    eventInterceptors,
    publishEvent,
    experienceRequestState,
    getProfileId: () => profileId,
    getProfileRevision: () => revision,
    getOnline: () => online,
    flushPolicy: resolveQueueFlushPolicy(undefined),
    applyOptimizationData,
    maxEvents: options.maxEvents,
  });
  return {
    delivery,
    experienceRequestState,
    upsertProfile,
    applyOptimizationData,
    eventInterceptors,
    publishEvent,
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
  it('validates and publishes intercepted events before transport, rejecting invalid rewrites', async () => {
    const f = fixture();
    const original = builder.buildTrack({ event: 'original' });
    const rewritten = { ...original, event: 'rewritten' };
    f.eventInterceptors.run
      .mockResolvedValueOnce(rewritten)
      .mockResolvedValueOnce({ type: 'track' });
    f.publishEvent.mockImplementation((event) => {
      expect(event).toEqual(rewritten);
      expect(f.upsertProfile).not.toHaveBeenCalled();
    });

    await f.delivery.send(original);
    expect(f.publishEvent).toHaveBeenCalledExactlyOnceWith(rewritten);
    expect(f.upsertProfile.mock.calls[0]?.[0].events).toEqual([rewritten]);
    await expect(f.delivery.send(original)).rejects.toThrow();
    expect(f.publishEvent).toHaveBeenCalledTimes(1);
    expect(f.upsertProfile).toHaveBeenCalledTimes(1);
  });

  it('admits a prepared batch before HTTP settles and preserves the exact events and GDPR metadata', async () => {
    const response = deferred<OptimizationData>();
    const f = fixture({ profileId: 'profile-1' });
    f.upsertProfile.mockReturnValueOnce(response.promise);
    const events = prepared();

    expect(f.delivery.sendPrepared(events, { locale: 'fr-FR' })).toEqual({ accepted: true });
    expect(f.experienceRequestState.value.status).toBe('pending');
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
    expect(f.applyOptimizationData).not.toHaveBeenCalled();

    response.resolve(data('profile-1'));
    await vi.waitFor(() => expect(f.delivery.queuedEventCount).toBe(0));
    expect(f.applyOptimizationData).toHaveBeenCalledWith(data('profile-1'), expect.any(Function));
  });

  it('does not send a direct event when a pending-state subscriber resets the owner', async () => {
    let value: ExperienceRequestState = { status: 'idle' };
    const experienceRequestState = {
      get value() {
        return value;
      },
      set value(next: ExperienceRequestState) {
        value = next;
        if (next.status === 'pending') f.delivery.reset();
      },
    };
    const f = fixture({ experienceRequestState });

    await expect(f.delivery.send(builder.buildPageView())).resolves.toEqual({ accepted: true });
    expect(f.upsertProfile).not.toHaveBeenCalled();
    expect(f.applyOptimizationData).not.toHaveBeenCalled();
    expect(experienceRequestState.value).toEqual({ status: 'idle' });
  });

  it('joins teardown triggered synchronously by pending publication and drains each batch once', async () => {
    let value: ExperienceRequestState = { status: 'idle' };
    let teardown: Promise<void> | undefined;
    let onPending: (() => void) | undefined;
    const experienceRequestState = {
      get value() {
        return value;
      },
      set value(next: ExperienceRequestState) {
        value = next;
        if (next.status === 'pending') onPending?.();
      },
    };
    const first = deferred<OptimizationData>();
    const second = deferred<OptimizationData>();
    const old = fixture({ online: false, profileId: 'captured-profile', experienceRequestState });
    old.upsertProfile.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const head = prepared('de-DE');
    const tail = prepared('fr-FR');
    old.delivery.sendPrepared(head, { locale: 'de-DE' });
    old.delivery.sendPrepared(tail, { locale: 'fr-FR' });
    onPending = () => {
      onPending = undefined;
      teardown = old.delivery.flushOnDestroy();
    };

    const drain = old.delivery.flush({ force: true });
    expect(teardown).toBeDefined();
    expect(old.upsertProfile).toHaveBeenCalledExactlyOnceWith(
      { profileId: 'captured-profile', events: head },
      { preflight: false, locale: 'de-DE' }
    );
    expect(experienceRequestState.value).toEqual({ status: 'idle' });
    const replacementResponse = deferred<OptimizationData>();
    const replacement = fixture({ experienceRequestState });
    replacement.upsertProfile.mockReturnValueOnce(replacementResponse.promise);
    const replacementRequest = replacement.delivery.send(builder.buildPageView());
    await Promise.resolve();
    expect(experienceRequestState.value).toEqual({ status: 'pending' });

    first.resolve(data('head-response'));
    await vi.waitFor(() => expect(old.upsertProfile).toHaveBeenCalledTimes(2));
    expect(old.upsertProfile.mock.calls[1]).toEqual([
      { profileId: 'captured-profile', events: tail },
      { preflight: false, locale: 'fr-FR' },
    ]);
    second.resolve(data('tail-response'));
    await Promise.all([drain, teardown]);
    expect(old.upsertProfile).toHaveBeenCalledTimes(2);
    expect(old.delivery.queuedEventCount).toBe(0);
    expect(old.applyOptimizationData).not.toHaveBeenCalled();
    expect(experienceRequestState.value).toEqual({ status: 'pending' });

    replacementResponse.resolve(data('replacement'));
    await replacementRequest;
    expect(experienceRequestState.value).toEqual({ status: 'success' });
  });

  it('refuses a valid prepared batch exceeding capacity without sending a prefix', () => {
    const f = fixture({ maxEvents: 2 });
    expect(prepared()).toHaveLength(2);
    expect(f.delivery.sendPrepared(prepared())).toEqual({ accepted: true });
    expect(f.delivery.sendPrepared(prepared())).toEqual({ accepted: false });
    expect(f.delivery.queuedEventCount).toBe(2);
    expect(f.upsertProfile).toHaveBeenCalledTimes(1);
  });

  it('fills the default capacity with one 100-event batch and refuses a batch that no longer fits', () => {
    // The batch limit itself is the validator's (see prepared-events.test.ts); this is capacity.
    const f = fixture({ online: false });
    const track = builder.buildTrack({ event: 'opened' });
    expect(f.delivery.sendPrepared([...Array(99).fill(track), builder.buildPageView()])).toEqual({
      accepted: true,
    });
    expect(f.delivery.sendPrepared([track, builder.buildPageView()])).toEqual({
      accepted: false,
    });
    expect(f.delivery.queuedEventCount).toBe(100);
    expect(f.upsertProfile).not.toHaveBeenCalled();
  });

  it('honors a larger queue capacity for prepared batches already validated at the boundary', async () => {
    // The 100-event batch limit is enforced where the batch is validated; the queue owns capacity.
    const f = fixture({ online: false, maxEvents: 250 });
    const track = builder.buildTrack({ event: 'queued' });
    const first = [...Array(99).fill(track), builder.buildPageView()];
    expect(f.delivery.sendPrepared(first)).toEqual({ accepted: true });
    await expect(f.delivery.send(track)).resolves.toEqual({ accepted: true });
    expect(f.delivery.sendPrepared([...Array(99).fill(track), builder.buildPageView()])).toEqual({
      accepted: true,
    });
    expect(f.delivery.sendPrepared([...Array(99).fill(track), builder.buildPageView()])).toEqual({
      accepted: false,
    });
    expect(f.delivery.queuedEventCount).toBe(201);

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
    expect(f.experienceRequestState.value).toEqual({ status: 'failed', reason: 'api-error' });
  });

  it('classifies an aborted transport as a timeout without queueing the direct event', async () => {
    const f = fixture();
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    f.upsertProfile.mockRejectedValueOnce(abort);

    await expect(f.delivery.send(builder.buildPageView())).rejects.toBe(abort);
    expect(f.experienceRequestState.value).toEqual({ status: 'failed', reason: 'timeout' });
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

    // Joiners await the active attempt, as in Optimization: no new request starts, and each
    // joiner settles only when the drain does.
    const drain = f.delivery.flush({ force: true });
    const joiners = [f.delivery.flush(), f.delivery.flush({ force: true })];
    expect(f.upsertProfile).toHaveBeenCalledTimes(1);

    let settled = false;
    void Promise.all([drain, ...joiners]).then(() => {
      settled = true;
    });
    firstResponse.resolve(data('continuation-id'));
    await vi.waitFor(() => expect(f.upsertProfile).toHaveBeenCalledTimes(2));
    expect(settled).toBe(false);
    const lateJoiner = f.delivery.flush({ force: true });
    expect(f.upsertProfile).toHaveBeenCalledTimes(2);
    secondResponse.resolve(data('continuation-id'));
    await Promise.all([drain, ...joiners, lateJoiner]);
    expect(settled).toBe(true);
    expect(f.upsertProfile).toHaveBeenCalledTimes(2);
    expect(f.delivery.queuedEventCount).toBe(0);
  });

  it('settles a failed flush while its retry is still scheduled', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const f = fixture({ online: false });
    f.upsertProfile.mockRejectedValueOnce(new Error('network'));
    expect(f.delivery.sendPrepared(prepared())).toEqual({ accepted: true });

    await f.delivery.flush({ force: true });
    expect(f.experienceRequestState.value).toEqual({ status: 'failed', reason: 'api-error' });
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
    expect(f.applyOptimizationData).not.toHaveBeenCalled();
    // A later flush joins the replacement attempt instead of starting another request.
    const joiner = f.delivery.flush({ force: true });
    expect(f.upsertProfile).toHaveBeenCalledTimes(2);

    replacementResponse.resolve(data('replacement-id'));
    await Promise.all([replacementDrain, joiner]);
    expect(f.upsertProfile).toHaveBeenCalledTimes(2);
    expect(f.delivery.queuedEventCount).toBe(0);
    expect(f.applyOptimizationData).toHaveBeenCalledExactlyOnceWith(
      data('replacement-id'),
      expect.any(Function)
    );
  });

  it('keeps retry body, IDs, target, and absent locale stable after a failure', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const f = fixture({ profileId: 'original' });
    f.upsertProfile.mockRejectedValueOnce(new Error('network'));
    const events = prepared();
    expect(f.delivery.sendPrepared(events)).toEqual({ accepted: true });
    await vi.waitFor(() => expect(f.experienceRequestState.value.status).toBe('failed'));
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
    // The owner adopts each published response as the current profile, as Web does; the
    // next live batch then reads it, as Optimization's live batches read profileSignal.
    f.applyOptimizationData.mockImplementation((published: OptimizationData) =>
      f.setProfile(published.profile.id)
    );
    f.upsertProfile.mockReturnValueOnce(response.promise);
    expect(f.delivery.sendPrepared(prepared())).toEqual({ accepted: true });
    expect(f.delivery.sendPrepared(prepared())).toEqual({ accepted: true });
    response.resolve(data('new-id'));
    await vi.waitFor(() => expect(f.upsertProfile).toHaveBeenCalledTimes(2));
    expect(f.upsertProfile.mock.calls[1]?.[0].profileId).toBe('new-id');
  });

  it.each(['reset', 'flushOnDestroy'] as const)(
    '%s prevents stale in-flight publication and retries',
    async (action) => {
      vi.useFakeTimers();
      const response = deferred<OptimizationData>();
      const f = fixture();
      f.upsertProfile.mockReturnValueOnce(response.promise);
      expect(f.delivery.sendPrepared(prepared())).toEqual({ accepted: true });
      void f.delivery[action]();
      response.resolve(data('stale'));
      await vi.runAllTimersAsync();
      expect(f.applyOptimizationData).not.toHaveBeenCalled();
      expect(f.experienceRequestState.value).toEqual({ status: 'idle' });
      expect(f.delivery.queuedEventCount).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
      if (action === 'flushOnDestroy')
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

    void f.delivery.flushOnDestroy();
    expect(f.upsertProfile).toHaveBeenCalledExactlyOnceWith(
      { profileId: undefined, events },
      { preflight: false, locale: undefined }
    );
    pending.resolve(data('late-profile'));
    await vi.waitFor(() => expect(f.delivery.queuedEventCount).toBe(0));
    expect(f.applyOptimizationData).not.toHaveBeenCalled();
    expect(f.experienceRequestState.value).toEqual({ status: 'idle' });
  });

  it('attempts every queued batch in order on destroy and carries the response profile ID', async () => {
    const firstResponse = deferred<OptimizationData>();
    const f = fixture({ online: false });
    f.upsertProfile.mockReturnValueOnce(firstResponse.promise);
    const first = prepared('de-DE');
    const second = prepared('fr-FR');
    expect(f.delivery.sendPrepared(first, { locale: 'de-DE' })).toEqual({ accepted: true });
    expect(f.delivery.sendPrepared(second, { locale: 'fr-FR' })).toEqual({ accepted: true });

    void f.delivery.flushOnDestroy();
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
    expect(f.applyOptimizationData).not.toHaveBeenCalled();
    expect(f.experienceRequestState.value).toEqual({ status: 'idle' });
  });

  it('continues an active flush on destroy without publishing late responses', async () => {
    const firstResponse = deferred<OptimizationData>();
    const f = fixture();
    f.upsertProfile.mockReturnValueOnce(firstResponse.promise);
    const first = prepared('de-DE');
    const second = prepared('fr-FR');
    expect(f.delivery.sendPrepared(first, { locale: 'de-DE' })).toEqual({ accepted: true });
    expect(f.delivery.sendPrepared(second, { locale: 'fr-FR' })).toEqual({ accepted: true });

    void f.delivery.flushOnDestroy();
    firstResponse.resolve(data('continuation-id'));
    await vi.waitFor(() => expect(f.upsertProfile).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(f.delivery.queuedEventCount).toBe(0));
    expect(f.applyOptimizationData).not.toHaveBeenCalled();
  });

  it('cancels the remaining destroy drain when reset follows destroy', async () => {
    const firstResponse = deferred<OptimizationData>();
    const f = fixture({ online: false });
    f.upsertProfile.mockReturnValueOnce(firstResponse.promise);
    expect(f.delivery.sendPrepared(prepared('de-DE'))).toEqual({ accepted: true });
    expect(f.delivery.sendPrepared(prepared('fr-FR'))).toEqual({ accepted: true });

    void f.delivery.flushOnDestroy();
    const drain = f.delivery.flush();
    expect(f.upsertProfile).toHaveBeenCalledTimes(1);
    f.delivery.reset();
    expect(f.delivery.queuedEventCount).toBe(0);

    firstResponse.resolve(data('late-profile'));
    await drain;
    expect(f.upsertProfile).toHaveBeenCalledTimes(1);
    expect(f.applyOptimizationData).not.toHaveBeenCalled();
    expect(f.experienceRequestState.value).toEqual({ status: 'idle' });
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
      void f.delivery.flushOnDestroy();
      await vi.runAllTimersAsync();
      expect(f.upsertProfile).toHaveBeenCalledTimes(1);
      expect(f.delivery.queuedEventCount).toBe(0);
      expect(f.experienceRequestState.value).toEqual({ status: 'idle' });
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

  describe('flushOnDestroy, following Optimization ExperienceQueue', () => {
    it('lets concurrent flush callers join the teardown drain without new requests', async () => {
      const response = deferred<OptimizationData>();
      const f = fixture({ online: false });
      f.upsertProfile.mockReturnValueOnce(response.promise);
      expect(f.delivery.sendPrepared(prepared())).toEqual({ accepted: true });

      const teardown = f.delivery.flushOnDestroy();
      let settledCount = 0;
      const joiners = [f.delivery.flush(), f.delivery.flush({ force: true })].map((joiner) =>
        joiner.then(() => {
          settledCount += 1;
        })
      );
      expect(f.upsertProfile).toHaveBeenCalledTimes(1);
      // While the drain's request is outstanding, no joiner has settled: they wait on it.
      for (let i = 0; i < 5; i++) await Promise.resolve();
      expect(settledCount).toBe(0);

      response.resolve(data('late'));
      await Promise.all([teardown, ...joiners]);
      expect(settledCount).toBe(2);
      expect(f.upsertProfile).toHaveBeenCalledTimes(1);
    });

    it('does not let a flush start new work once teardown has finished', async () => {
      const f = fixture({ online: false });
      expect(f.delivery.sendPrepared(prepared())).toEqual({ accepted: true });
      await f.delivery.flushOnDestroy();

      await f.delivery.flush({ force: true });

      expect(f.upsertProfile).toHaveBeenCalledTimes(1);
      expect(f.delivery.sendPrepared(prepared())).toEqual({ accepted: false });
    });

    it('keeps a replacement delivery isolated from a draining one', async () => {
      const draining = deferred<OptimizationData>();
      const old = fixture({ online: false });
      old.upsertProfile.mockReturnValueOnce(draining.promise);
      expect(old.delivery.sendPrepared(prepared('de-DE'))).toEqual({ accepted: true });
      const teardown = old.delivery.flushOnDestroy();

      const replacement = fixture();
      expect(replacement.delivery.sendPrepared(prepared('fr-FR'))).toEqual({ accepted: true });
      await vi.waitFor(() => expect(replacement.applyOptimizationData).toHaveBeenCalledTimes(1));

      draining.resolve(data('old-visitor'));
      await teardown;
      expect(old.applyOptimizationData).not.toHaveBeenCalled();
      expect(replacement.upsertProfile).toHaveBeenCalledTimes(1);
      expect(replacement.delivery.queuedEventCount).toBe(0);
    });
  });

  describe('profile continuation is local to the current drain, as Optimization', () => {
    it('sends a teardown drain under the captured current profile, not an older drain profile', async () => {
      const f = fixture({ online: false });
      f.applyOptimizationData.mockImplementation((published: OptimizationData) =>
        f.setProfile(published.profile.id)
      );
      // A completed drain under A.
      f.upsertProfile.mockResolvedValueOnce(data('A'));
      await f.delivery.send(builder.buildPageView());
      f.setOnline(true);
      await f.delivery.flush({ force: true });
      // A newer direct response establishes B as the current profile.
      f.upsertProfile.mockResolvedValueOnce(data('B'));
      await f.delivery.send(builder.buildIdentify({ userId: 'user-1' }));
      // An ordinary offline event, drained during destruction.
      f.setOnline(false);
      await f.delivery.send(builder.buildPageView());
      f.upsertProfile.mockResolvedValueOnce(data('B'));
      await f.delivery.flushOnDestroy();

      expect(f.upsertProfile.mock.calls.at(-1)?.[0].profileId).toBe('B');
    });

    it('carries a teardown drain response to the next ordinary batch of the same drain', async () => {
      const f = fixture({ online: false, profileId: 'captured' });
      f.upsertProfile
        .mockResolvedValueOnce(data('after-first'))
        .mockResolvedValueOnce(data('after-second'))
        .mockResolvedValueOnce(data('after-third'));
      // Three batches: ordinary, prepared, ordinary. The prepared one splits the two.
      await f.delivery.send(builder.buildTrack({ event: 'first' }));
      expect(f.delivery.sendPrepared(prepared())).toEqual({ accepted: true });
      await f.delivery.send(builder.buildTrack({ event: 'third' }));

      await f.delivery.flushOnDestroy();

      // The drain starts from the captured identity, then follows its own latest response,
      // as Optimization does with `profileId = data?.profile.id ?? profileId`.
      expect(f.upsertProfile.mock.calls[0]?.[0].profileId).toBe('captured');
      expect(f.upsertProfile.mock.calls[2]?.[0].profileId).toBe('after-second');
    });
  });

  describe('late direct requests vs authorized teardown deliveries, as Optimization', () => {
    it('resolves { accepted: true } without data when a direct request fails after destroy', async () => {
      let reject!: (error: unknown) => void;
      const failing = new Promise<OptimizationData>((_, r) => (reject = r));
      const f = fixture({ profileId: 'visitor' });
      f.upsertProfile.mockReturnValueOnce(failing);
      const result = f.delivery.send(builder.buildPageView());
      await Promise.resolve();

      await f.delivery.flushOnDestroy();
      reject(new Error('network'));

      await expect(result).resolves.toEqual({ accepted: true });
      expect(f.experienceRequestState.value).toEqual({ status: 'idle' });
    });

    it('resolves { accepted: true } without data when a direct request succeeds after destroy', async () => {
      const response = deferred<OptimizationData>();
      const f = fixture({ profileId: 'visitor' });
      f.upsertProfile.mockReturnValueOnce(response.promise);
      const result = f.delivery.send(builder.buildPageView());
      await Promise.resolve();

      await f.delivery.flushOnDestroy();
      response.resolve(data('late'));

      await expect(result).resolves.toEqual({ accepted: true });
      expect(f.applyOptimizationData).not.toHaveBeenCalled();
    });

    it('still delivers a live direct request normally before destroy', async () => {
      const f = fixture({ profileId: 'visitor' });
      f.upsertProfile.mockResolvedValueOnce(data('live'));

      await expect(f.delivery.send(builder.buildPageView())).resolves.toEqual({
        accepted: true,
        data: data('live'),
      });
      expect(f.applyOptimizationData).toHaveBeenCalledExactlyOnceWith(
        data('live'),
        expect.any(Function)
      );
      expect(f.experienceRequestState.value).toEqual({ status: 'success' });
    });
  });
});
