import {
  ExperienceEvent as ExperienceEventSchema,
  parseWithFriendlyError as parseOptimizationSchema,
  type ExperienceEvent,
  type OptimizationData,
} from '@contentful/optimization-api-client/api-schemas';
import type { EventEmissionResult } from './event-emission-result.js';
import type { RuntimeOptimizationApiClient } from './runtime-event-methods.js';
import {
  PersonalizationFlushRuntime,
  type PersonalizationFlushPolicy,
} from './personalization-flush.js';
import { validatePreparedEvents } from './prepared-events.js';

type PersonalizationApi = RuntimeOptimizationApiClient['personalization'];
type DeliveryRequest = { profileId?: string; locale?: string };
type QueuedBatch = { events: ExperienceEvent[]; request?: DeliveryRequest };

export type PersonalizationDeliveryState =
  | { readonly status: 'idle' | 'pending' | 'success' }
  | { readonly status: 'failed'; readonly reason: 'timeout' | 'api-error' };

interface PersonalizationDeliveryOptions {
  readonly api: PersonalizationApi;
  readonly getProfileId: () => string | undefined;
  readonly getProfileRevision: () => number;
  readonly getOnline: () => boolean;
  readonly publishQueuedData: (data: OptimizationData) => void;
  /** Internal override for deterministic tests; Web uses Optimization's default 100. */
  readonly maxEvents?: number;
  readonly flushPolicy?: PersonalizationFlushPolicy;
}

/** One low-level Personalization transport for direct and queued sends. */
export function sendPersonalizationEvents(
  api: PersonalizationApi,
  events: readonly ExperienceEvent[],
  profileId: string | undefined,
  options?: { locale?: string; preflight?: boolean }
): Promise<OptimizationData> {
  return api.upsertProfile({ profileId, events: [...events] }, options);
}

/** In-memory Experience event queue adapted from Optimization's ExperienceQueue. */
export class PersonalizationDelivery {
  readonly #api: PersonalizationApi;
  readonly #getProfileId: PersonalizationDeliveryOptions['getProfileId'];
  readonly #getProfileRevision: PersonalizationDeliveryOptions['getProfileRevision'];
  readonly #getOnline: PersonalizationDeliveryOptions['getOnline'];
  readonly #publishQueuedData: PersonalizationDeliveryOptions['publishQueuedData'];
  readonly #maxEvents: number;
  readonly #flushRuntime: PersonalizationFlushRuntime;
  readonly #queue: QueuedBatch[] = [];
  #token: object | undefined = {};
  #continuationProfileId: string | undefined;
  #state: PersonalizationDeliveryState = { status: 'idle' };

  constructor(options: PersonalizationDeliveryOptions) {
    this.#api = options.api;
    this.#getProfileId = options.getProfileId;
    this.#getProfileRevision = options.getProfileRevision;
    this.#getOnline = options.getOnline;
    this.#publishQueuedData = options.publishQueuedData;
    this.#maxEvents = options.maxEvents ?? 100;
    this.#flushRuntime = new PersonalizationFlushRuntime(
      () => void this.flush(),
      options.flushPolicy
    );
  }

  get state(): PersonalizationDeliveryState {
    return this.#state;
  }

  get queuedEventCount(): number {
    return this.#queue.reduce((count, batch) => count + batch.events.length, 0);
  }

  /** Ordinary online events go direct; offline events use the same queued transport. */
  async send(event: ExperienceEvent): Promise<EventEmissionResult> {
    if (this.#token === undefined) return { accepted: false };
    const validEvent = parseOptimizationSchema(ExperienceEventSchema, event);
    if (this.#getOnline()) {
      const data = await this.#upsert([validEvent], undefined, false);
      return data === undefined ? { accepted: true } : { accepted: true, data };
    }
    this.#enqueueOrdinary(validEvent);
    return { accepted: true };
  }

  /** Admit an entire prepared batch without waiting for HTTP completion. */
  sendPrepared(
    events: readonly ExperienceEvent[],
    target: { profileId?: string; locale?: string } = {}
  ): EventEmissionResult {
    if (this.#token === undefined) return { accepted: false };
    let validEvents: readonly ExperienceEvent[];
    try {
      validEvents = validatePreparedEvents(events);
    } catch {
      return { accepted: false };
    }
    if (this.queuedEventCount + validEvents.length > this.#maxEvents) {
      return { accepted: false };
    }

    this.#queue.push({
      events: [...validEvents],
      request: { profileId: target.profileId ?? this.#getProfileId(), locale: target.locale },
    });
    void this.flush();
    return { accepted: true };
  }

  clearScheduledRetry(): void {
    this.#flushRuntime.clearScheduledRetry();
  }

  async flush({ force = false }: { force?: boolean } = {}): Promise<void> {
    if (
      this.#flushRuntime.shouldSkip({
        force,
        isOnline: this.#getOnline() && this.#token !== undefined,
      })
    ) {
      return;
    }
    if (this.#queue.length === 0) {
      this.#flushRuntime.clearScheduledRetry();
      return;
    }

    const token = this.#token;
    const isCurrent = (): boolean => token !== undefined && token === this.#token;
    this.#flushRuntime.markFlushStarted();
    try {
      await this.#sendQueuedBatches(token);
      if (isCurrent()) this.#flushRuntime.handleFlushSuccess();
    } catch {
      if (isCurrent()) {
        this.#flushRuntime.handleFlushFailure();
      }
    } finally {
      if (isCurrent()) this.#flushRuntime.markFlushFinished();
    }
  }

  reset(): void {
    if (this.#token === undefined) return;
    this.#token = {};
    this.#continuationProfileId = undefined;
    this.#queue.length = 0;
    this.#flushRuntime.reset();
    this.#state = { status: 'idle' };
  }

  /** Optimization-style best-effort flush; late responses cannot publish or retry. */
  destroy(): void {
    if (this.#token === undefined) return;
    void this.flush({ force: true });
    this.#token = undefined;
    this.#continuationProfileId = undefined;
    this.#queue.length = 0;
    this.#flushRuntime.reset();
    this.#state = { status: 'idle' };
  }

  async #sendQueuedBatches(token: object | undefined): Promise<void> {
    while (this.#queue.length > 0) {
      const first = this.#queue[0];
      if (first === undefined) break;
      const snapshot = [...first.events];
      await this.#upsert(snapshot, first.request, true);
      if (token !== this.#token) return;
      if (this.#queue[0] === first) {
        const offset = snapshot.findIndex((event) => event === first.events[0]);
        if (offset >= 0) first.events.splice(0, snapshot.length - offset);
        if (first.events.length === 0) this.#queue.shift();
      }
    }
  }

  #enqueueOrdinary(event: ExperienceEvent): void {
    if (this.queuedEventCount >= this.#maxEvents) {
      let remaining = this.queuedEventCount - this.#maxEvents + 1;
      while (remaining > 0) {
        const oldest = this.#queue[0];
        if (oldest === undefined) break;
        const dropCount = oldest.request === undefined ? remaining : oldest.events.length;
        const dropped = oldest.events.splice(0, dropCount);
        remaining -= dropped.length;
        if (oldest.events.length === 0) this.#queue.shift();
      }
    }
    const last = this.#queue.at(-1);
    if (last !== undefined && last.request === undefined) last.events.push(event);
    else this.#queue.push({ events: [event] });
  }

  async #upsert(
    events: ExperienceEvent[],
    request: DeliveryRequest | undefined,
    publishQueued: boolean
  ): Promise<OptimizationData | undefined> {
    const token = this.#token;
    const isCurrent = (): boolean => token !== undefined && token === this.#token;
    const profileRevision = this.#getProfileRevision();
    if (isCurrent()) this.#state = { status: 'pending' };
    try {
      const profileId = request?.profileId ?? this.#getProfileId() ?? this.#continuationProfileId;
      if (request !== undefined) request.profileId = profileId;
      const data = await sendPersonalizationEvents(
        this.#api,
        events,
        profileId,
        request === undefined
          ? { locale: events[0]?.context.locale }
          : { preflight: false, locale: request.locale ?? '' }
      );
      if (!isCurrent()) return undefined;
      if (request !== undefined) request.profileId ??= data.profile.id;
      if (publishQueued) this.#continuationProfileId = data.profile.id;
      if (publishQueued && profileRevision === this.#getProfileRevision()) {
        this.#publishQueuedData(data);
      }
      this.#state = { status: 'success' };
      return data;
    } catch (error) {
      if (!isCurrent()) return undefined;
      this.#state = {
        status: 'failed',
        reason: error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'api-error',
      };
      throw error;
    }
  }
}
