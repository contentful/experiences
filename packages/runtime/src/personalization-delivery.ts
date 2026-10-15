import {
  ExperienceEvent as ExperienceEventSchema,
  parseWithFriendlyError as parseOptimizationSchema,
  type ExperienceEvent,
  type OptimizationData,
} from '@contentful/optimization-api-client/api-schemas';
import { createScopedLogger } from '@contentful/optimization-api-client/logger';
import type { EventEmissionResult } from './event-emission-result.js';
import type { RuntimeOptimizationApiClient } from './runtime-event-methods.js';
import {
  QueueFlushRuntime,
  resolveQueueFlushPolicy,
  type QueueFlushPolicy,
} from './lib/queue/index.js';
import { OFFLINE_QUEUE_MAX_EVENTS } from './lib/queue/index.js';

const deliveryLogger = createScopedLogger('Experiences:PersonalizationDelivery');

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
  /** Current content locale for ordinary sends; prepared batches retain their own locale. */
  readonly getLocale?: () => string | undefined;
  readonly publishQueuedData: (data: OptimizationData) => void;
  /** Offline admission capacity: `queuePolicy.offlineMaxEvents`, defaulting to 100 events. */
  readonly maxEvents?: number;
  readonly flushPolicy?: QueueFlushPolicy;
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
  readonly #getLocale: PersonalizationDeliveryOptions['getLocale'];
  readonly #publishQueuedData: PersonalizationDeliveryOptions['publishQueuedData'];
  readonly #maxEvents: number;
  readonly #flushRuntime: QueueFlushRuntime;
  readonly #queue: QueuedBatch[] = [];
  #token: object | undefined = {};
  #activeFlush: Promise<void> | undefined;
  #closing = false;
  #closingProfileId: string | undefined;
  #continuationProfileId: string | undefined;
  #state: PersonalizationDeliveryState = { status: 'idle' };

  constructor(options: PersonalizationDeliveryOptions) {
    this.#api = options.api;
    this.#getProfileId = options.getProfileId;
    this.#getProfileRevision = options.getProfileRevision;
    this.#getOnline = options.getOnline;
    this.#getLocale = options.getLocale;
    this.#publishQueuedData = options.publishQueuedData;
    this.#maxEvents = options.maxEvents ?? OFFLINE_QUEUE_MAX_EVENTS;
    this.#flushRuntime = new QueueFlushRuntime({
      policy: resolveQueueFlushPolicy(options.flushPolicy),
      onRetry: () => {
        void this.flush();
      },
      onCallbackError: (callbackName, error) => {
        deliveryLogger.warn(
          `Personalization flush policy callback "${callbackName}" failed`,
          error
        );
      },
    });
  }

  get state(): PersonalizationDeliveryState {
    return this.#state;
  }

  get queuedEventCount(): number {
    return this.#queue.reduce((count, batch) => count + batch.events.length, 0);
  }

  /** Ordinary online events go direct; offline events use the same queued transport. */
  async send(event: ExperienceEvent): Promise<EventEmissionResult> {
    if (this.#token === undefined || this.#closing) return { accepted: false };
    const validEvent = parseOptimizationSchema(ExperienceEventSchema, event);
    if (this.#getOnline()) {
      const data = await this.#upsert([validEvent], undefined, false);
      return data === undefined ? { accepted: true } : { accepted: true, data };
    }
    if (this.queuedEventCount >= this.#maxEvents) return { accepted: false };
    this.#enqueueOrdinary(validEvent);
    return { accepted: true };
  }

  /**
   * Admit an entire prepared batch without waiting for HTTP completion.
   *
   * The batch is already validated: validation, the shared batch limits and consent belong
   * to the emission boundary, which hands the queue the validated type. This only checks
   * that the queue has room.
   */
  sendPrepared(
    events: readonly ExperienceEvent[],
    target: { profileId?: string; locale?: string } = {}
  ): EventEmissionResult {
    if (this.#token === undefined || this.#closing) return { accepted: false };
    if (this.queuedEventCount + events.length > this.#maxEvents) {
      return { accepted: false };
    }

    this.#queue.push({
      events: [...events],
      request: { profileId: target.profileId ?? this.#getProfileId(), locale: target.locale },
    });
    void this.flush();
    return { accepted: true };
  }

  clearScheduledRetry(): void {
    this.#flushRuntime.clearScheduledRetry();
  }

  flush({ force = false }: { force?: boolean } = {}): Promise<void> {
    if (this.#closing) return this.#activeFlush ?? Promise.resolve();
    return this.#startFlush(force);
  }

  #startFlush(force: boolean): Promise<void> {
    if (this.#activeFlush !== undefined) return this.#activeFlush;
    if (this.#token === undefined) return Promise.resolve();
    if (
      this.#flushRuntime.shouldSkip({
        force,
        isOnline: this.#getOnline() && this.#token !== undefined,
      })
    ) {
      return Promise.resolve();
    }
    if (this.#queue.length === 0) {
      this.#flushRuntime.clearScheduledRetry();
      return Promise.resolve();
    }

    const token = this.#token;
    this.#flushRuntime.markFlushStarted();
    const attempt = this.#runQueuedFlush(token);
    this.#activeFlush = attempt;
    void attempt.then(
      () => {
        if (this.#activeFlush === attempt) this.#activeFlush = undefined;
      },
      () => {
        if (this.#activeFlush === attempt) this.#activeFlush = undefined;
      }
    );
    return attempt;
  }

  async #runQueuedFlush(token: object): Promise<void> {
    const isCurrent = (): boolean => token === this.#token;
    try {
      await this.#sendQueuedBatches(token);
      if (isCurrent() && !this.#closing) this.#flushRuntime.handleFlushSuccess();
    } catch (error) {
      if (isCurrent()) {
        deliveryLogger.warn('Personalization queue flush request failed', {
          queuedEvents: this.queuedEventCount,
          reason: error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'api-error',
          errorName: error instanceof Error ? error.name : 'unknown',
        });
        if (!this.#closing) {
          this.#flushRuntime.handleFlushFailure({
            queuedBatches: this.#queue.length,
            queuedEvents: this.queuedEventCount,
          });
        }
      }
    } finally {
      if (isCurrent()) this.#flushRuntime.markFlushFinished();
    }
  }

  /**
   * Drops queued batches, cancels the scheduled retry, and invalidates requests
   * already in flight, leaving the delivery live. A request on the wire cannot be
   * recalled, but its response can no longer publish profile or delivery state.
   * Used when event consent is withdrawn, so events accepted earlier are not sent,
   * and nothing they return is kept, after the visitor says no.
   */
  clearQueue(): void {
    if (this.#token === undefined) return;
    this.#token = this.#closing ? undefined : {};
    this.#activeFlush = undefined;
    this.#queue.length = 0;
    this.#flushRuntime.reset();
    this.#state = { status: 'idle' };
  }

  reset(): void {
    if (this.#token === undefined) return;
    this.#token = this.#closing ? undefined : {};
    this.#activeFlush = undefined;
    this.#closingProfileId = undefined;
    this.#continuationProfileId = undefined;
    this.#queue.length = 0;
    this.#flushRuntime.reset();
    this.#state = { status: 'idle' };
  }

  /** Attempt queued batches in order without publishing after teardown. */
  destroy(): void {
    if (this.#token === undefined || this.#closing) return;
    this.#closing = true;
    this.#closingProfileId = this.#getProfileId();
    this.#state = { status: 'idle' };
    this.#flushRuntime.clearScheduledRetry();
    const drain = this.#activeFlush ?? this.#startFlush(true);
    void drain.then(
      () => this.#finishDestroy(),
      () => this.#finishDestroy()
    );
  }

  #finishDestroy(): void {
    this.#token = undefined;
    this.#closingProfileId = undefined;
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
    if (isCurrent() && !this.#closing) this.#state = { status: 'pending' };
    try {
      const profileId =
        request?.profileId ??
        (this.#closing
          ? (this.#continuationProfileId ?? this.#closingProfileId)
          : (this.#getProfileId() ?? this.#continuationProfileId));
      if (request !== undefined) request.profileId = profileId;
      const data = await sendPersonalizationEvents(
        this.#api,
        events,
        profileId,
        request === undefined
          ? { locale: this.#getLocale?.() }
          : { preflight: false, locale: request.locale }
      );
      if (!isCurrent()) return undefined;
      if (this.#closing && !publishQueued) return undefined;
      if (request !== undefined) request.profileId ??= data.profile.id;
      if (publishQueued) this.#continuationProfileId = data.profile.id;
      if (!this.#closing && publishQueued && profileRevision === this.#getProfileRevision()) {
        this.#publishQueuedData(data);
      }
      if (!this.#closing) this.#state = { status: 'success' };
      return data;
    } catch (error) {
      if (!isCurrent()) return undefined;
      if (!this.#closing) {
        this.#state = {
          status: 'failed',
          reason: error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'api-error',
        };
      }
      throw error;
    }
  }
}
