import {
  ExperienceEvent as ExperienceEventSchema,
  parseWithFriendlyError as parseOptimizationSchema,
  type ExperienceEvent,
  type OptimizationData,
} from '@contentful/optimization-api-client/api-schemas';
import { createScopedLogger } from '@contentful/optimization-api-client/logger';
import type { ExperienceRequestState } from './experience-request-state.js';
import type { EventEmissionResult } from './event-emission-result.js';
import type { EventInterceptors } from './event-interceptors.js';
import type {
  ExperienceRequestOptions,
  RuntimeOptimizationApiClient,
} from './runtime-event-methods.js';
import {
  OFFLINE_QUEUE_MAX_EVENTS,
  QueueFlushRuntime,
  type ResolvedQueueFlushPolicy,
} from './lib/queue/index.js';

const deliveryLogger = createScopedLogger('Experiences:PersonalizationDelivery');

type PersonalizationApi = RuntimeOptimizationApiClient['experience'];
type DeliveryRequest = { profileId?: string; locale?: string };
type QueuedBatch = { events: ExperienceEvent[]; request?: DeliveryRequest };
/** A teardown-authorized delivery with a captured identity. */
type QueuedDelivery = { token: object | undefined; profileId?: string };

interface PersonalizationDeliveryOptions {
  readonly api: PersonalizationApi;
  /** Owner-provided state slot; the runtime does not require a signals implementation. */
  readonly experienceRequestState: { value: ExperienceRequestState };
  readonly getProfileId: () => string | undefined;
  readonly getProfileRevision: () => number;
  readonly getOnline: () => boolean;
  /** Current content locale for ordinary sends; prepared batches retain their own locale. */
  readonly getLocale?: () => string | undefined;
  readonly eventInterceptors: EventInterceptors;
  readonly publishEvent: (event: ExperienceEvent) => void;
  /** Owner consent check after interception/schema validation, before publication. */
  readonly admitEvent?: (event: ExperienceEvent) => boolean;
  /** Publish the response and success state together while the request remains live. */
  readonly applyOptimizationData: (
    data: OptimizationData,
    isCurrent: () => boolean
  ) => void | Promise<void>;
  /** Offline admission capacity: `queuePolicy.offlineMaxEvents`, defaulting to 100 events. */
  readonly maxEvents?: number;
  readonly flushPolicy: ResolvedQueueFlushPolicy;
}

/** One low-level Personalization transport for direct and queued sends. */
export function sendPersonalizationEvents(
  api: PersonalizationApi,
  events: readonly ExperienceEvent[],
  profileId: string | undefined,
  options?: ExperienceRequestOptions & { preflight?: boolean }
): Promise<OptimizationData> {
  return api.upsertProfile({ profileId, events: [...events] }, options);
}

/** In-memory Experience event queue adapted from Optimization's ExperienceQueue. */
export class PersonalizationDelivery {
  readonly #api: PersonalizationApi;
  readonly #experienceRequestState: PersonalizationDeliveryOptions['experienceRequestState'];
  readonly #getProfileId: PersonalizationDeliveryOptions['getProfileId'];
  readonly #getProfileRevision: PersonalizationDeliveryOptions['getProfileRevision'];
  readonly #getOnline: PersonalizationDeliveryOptions['getOnline'];
  readonly #getLocale: PersonalizationDeliveryOptions['getLocale'];
  readonly #applyOptimizationData: PersonalizationDeliveryOptions['applyOptimizationData'];
  readonly #eventInterceptors: EventInterceptors;
  readonly #publishEvent: PersonalizationDeliveryOptions['publishEvent'];
  readonly #admitEvent: PersonalizationDeliveryOptions['admitEvent'];
  readonly #maxEvents: number;
  readonly #flushRuntime: QueueFlushRuntime;
  readonly #queue: QueuedBatch[] = [];
  #token: object | undefined = {};
  #activeFlush: Promise<void> | undefined;
  #destroying = false;
  #destroyToken: object | undefined;
  #destroyProfileId: string | undefined;

  constructor(options: PersonalizationDeliveryOptions) {
    this.#api = options.api;
    this.#experienceRequestState = options.experienceRequestState;
    this.#getProfileId = options.getProfileId;
    this.#getProfileRevision = options.getProfileRevision;
    this.#getOnline = options.getOnline;
    this.#getLocale = options.getLocale;
    this.#applyOptimizationData = options.applyOptimizationData;
    this.#eventInterceptors = options.eventInterceptors;
    this.#publishEvent = options.publishEvent;
    this.#admitEvent = options.admitEvent;
    this.#maxEvents = options.maxEvents ?? OFFLINE_QUEUE_MAX_EVENTS;
    this.#flushRuntime = new QueueFlushRuntime({
      policy: options.flushPolicy,
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

  get queuedEventCount(): number {
    return this.#queue.reduce((count, batch) => count + batch.events.length, 0);
  }

  /** Ordinary online events go direct; offline events use the same queued transport. */
  async send(event: ExperienceEvent): Promise<EventEmissionResult> {
    if (!this.#isAcceptingEvents()) return { accepted: false };
    const token = this.#token;
    const intercepted = await this.#eventInterceptors.run(event);
    if (!this.#isLiveRequest(token)) return { accepted: false };
    const validEvent = parseOptimizationSchema(ExperienceEventSchema, intercepted);
    if (this.#admitEvent?.(validEvent) === false || !this.#isLiveRequest(token))
      return { accepted: false };
    this.#publishEvent(validEvent);
    if (!this.#isLiveRequest(token)) return { accepted: false };
    if (this.#getOnline()) {
      const data = await this.#upsert([validEvent], undefined, undefined);
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
    if (!this.#isAcceptingEvents()) return { accepted: false };
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

  /**
   * Join an attempt already in flight, or start one unless a gate skips it. Teardown runs
   * through here too, with `allowDestroy`.
   */
  async flush({
    force = false,
    allowDestroy = false,
  }: { force?: boolean; allowDestroy?: boolean } = {}): Promise<void> {
    if (this.#activeFlush !== undefined) {
      await this.#activeFlush;
      return;
    }
    if (this.#shouldSkipFlush(force, allowDestroy)) return;
    if (this.#queue.length === 0) {
      this.#flushRuntime.clearScheduledRetry();
      return;
    }

    const token = this.#token;
    let resolveAttempt!: () => void;
    let rejectAttempt!: (error: unknown) => void;
    const attempt = new Promise<void>((resolve, reject) => {
      resolveAttempt = resolve;
      rejectAttempt = reject;
    });
    // Establish joining before pending-state observers can reenter flush or teardown.
    this.#activeFlush = attempt;
    void this.#flushAttempt(token).then(resolveAttempt, rejectAttempt);
    try {
      await attempt;
    } finally {
      if (this.#activeFlush === attempt) this.#activeFlush = undefined;
    }
  }

  /**
   * Capture the teardown identity, stop accepting work and retries, then make one forced
   * attempt at the queue through the common flush path.
   */
  async flushOnDestroy(): Promise<void> {
    this.#destroyToken = this.#token;
    this.#destroyProfileId = this.#getProfileId();
    this.#destroying = true;
    this.#experienceRequestState.value = { status: 'idle' };
    this.clearScheduledRetry();
    await this.flush({ force: true, allowDestroy: true });
  }

  #isAcceptingEvents(): boolean {
    return !this.#destroying && this.#token !== undefined;
  }

  #shouldSkipFlush(force: boolean, allowDestroy: boolean): boolean {
    return (
      (this.#destroying && !allowDestroy) ||
      this.#token === undefined ||
      this.#flushRuntime.shouldSkip({
        force,
        isOnline: this.#getOnline(),
      })
    );
  }

  async #flushAttempt(token: object | undefined): Promise<void> {
    this.#flushRuntime.markFlushStarted();
    try {
      await this.#sendQueuedBatches(token);
      this.#finishSuccessfulFlush(token);
    } catch (error) {
      this.#handleFlushError(error, token);
    } finally {
      this.#finishFlush(token);
    }
  }

  #finishSuccessfulFlush(token: object | undefined): void {
    if (this.#isDeliveryCurrent(token) && !this.#destroying)
      this.#flushRuntime.handleFlushSuccess();
  }

  #handleFlushError(error: unknown, token: object | undefined): void {
    if (!this.#isDeliveryCurrent(token)) return;
    deliveryLogger.warn('Personalization queue flush request failed', {
      queuedEvents: this.queuedEventCount,
      reason: error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'api-error',
      errorName: error instanceof Error ? error.name : 'unknown',
    });
    if (!this.#destroying) {
      this.#flushRuntime.handleFlushFailure({
        queuedBatches: this.#queue.length,
        queuedEvents: this.queuedEventCount,
      });
    }
  }

  /** Release the attempt; a teardown attempt also clears what teardown leaves behind. */
  #finishFlush(token: object | undefined): void {
    if (!this.#isDeliveryCurrent(token)) return;
    this.#flushRuntime.markFlushFinished();
    if (!this.#destroying) return;
    this.#token = undefined;
    this.#queue.length = 0;
    this.#destroyToken = undefined;
    this.#destroyProfileId = undefined;
    this.#flushRuntime.reset();
  }

  #isDeliveryCurrent(token: object | undefined): boolean {
    return (
      token !== undefined &&
      (token === this.#token || (this.#destroying && token === this.#destroyToken))
    );
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
    this.#token = this.#destroying ? undefined : {};
    this.#activeFlush = undefined;
    this.#queue.length = 0;
    this.#flushRuntime.reset();
    if (!this.#destroying) this.#experienceRequestState.value = { status: 'idle' };
  }

  reset(): void {
    if (this.#token === undefined) return;
    this.#destroyToken = undefined;
    this.#destroyProfileId = undefined;
    this.clearQueue();
  }

  async #sendQueuedBatches(token: object | undefined): Promise<void> {
    // Continuation is local to this drain: a teardown
    // drain starts from the captured current identity and follows only its own responses.
    let profileId: string | undefined = undefined;
    while (this.#queue.length > 0) {
      const first = this.#queue[0];
      if (first === undefined) break;
      const snapshot = [...first.events];
      const data = await this.#upsert(snapshot, first.request, {
        token,
        profileId: this.#destroying ? profileId : undefined,
      });
      if (!this.#isDeliveryCurrent(token)) return;
      profileId = data?.profile.id ?? profileId;
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

  /**
   * Send one request. A live request (not destroying, current token) may publish and update
   * delivery state. A teardown drain is accepted only when it carries the teardown token.
   * An ordinary direct request carries no delivery, so once it is no longer live its late
   * success and late failure are both discarded.
   */
  async #upsert(
    events: ExperienceEvent[],
    request: DeliveryRequest | undefined,
    delivery: QueuedDelivery | undefined
  ): Promise<OptimizationData | undefined> {
    const token = this.#token;
    const profileRevision = this.#getProfileRevision();
    const isLive = (): boolean => this.#isLiveRequest(token);
    const canPublish = (): boolean => isLive() && profileRevision === this.#getProfileRevision();
    const isDestroyDrain = (): boolean => this.#isDestroyDeliveryCurrent(delivery);
    const isAccepted = (): boolean => isLive() || isDestroyDrain();
    if (isLive()) this.#experienceRequestState.value = { status: 'pending' };
    if (!isAccepted()) return undefined;
    try {
      const data = await this.#requestExperienceData(events, request, delivery?.profileId);
      if (!isAccepted()) return undefined;
      if (request !== undefined) request.profileId ??= data.profile.id;
      if (canPublish()) await this.#applyOptimizationData(data, isLive);
      else if (isLive()) this.#experienceRequestState.value = { status: 'success' };
      return isAccepted() ? data : undefined;
    } catch (error) {
      if (!isAccepted()) return undefined;
      if (isLive()) {
        this.#experienceRequestState.value = {
          status: 'failed',
          reason: error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'api-error',
        };
      }
      throw error;
    }
  }

  #isLiveRequest(token: object | undefined): boolean {
    return !this.#destroying && token !== undefined && token === this.#token;
  }

  #isDestroyDeliveryCurrent(delivery: QueuedDelivery | undefined): boolean {
    return (
      this.#destroying && this.#destroyToken !== undefined && delivery?.token === this.#destroyToken
    );
  }

  /** Request identity precedence, including the captured teardown continuation. */
  #requestExperienceData(
    events: ExperienceEvent[],
    request: DeliveryRequest | undefined,
    continuationProfileId: string | undefined
  ): Promise<OptimizationData> {
    const profileId =
      request?.profileId ??
      continuationProfileId ??
      (this.#destroying ? this.#destroyProfileId : this.#getProfileId());
    if (request !== undefined) request.profileId = profileId;
    return sendPersonalizationEvents(
      this.#api,
      events,
      profileId,
      request === undefined
        ? { locale: this.#getLocale?.() }
        : { preflight: false, locale: request.locale }
    );
  }
}
