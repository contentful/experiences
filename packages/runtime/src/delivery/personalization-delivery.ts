import type { ExperienceApiClient as PersonalizationApiClient } from '@contentful/optimization-api-client';
import {
  ExperienceEvent as PersonalizationEventSchema,
  parseWithFriendlyError as parseOptimizationSchema,
  type ExperienceEvent as PersonalizationEvent,
  type OptimizationData,
} from '@contentful/optimization-api-client/api-schemas';
import { createScopedLogger } from '@contentful/optimization-api-client/logger';
import type { PersonalizationRequestState } from './personalization-request-state.js';
import type { EventEmissionResult } from '../events/event-emission-result.js';
import type { EventInterceptors } from '../events/event-interceptors.js';
import {
  OFFLINE_QUEUE_MAX_EVENTS,
  FlushRuntime,
  type ResolvedQueueFlushPolicy,
} from './queue/index.js';

const deliveryLogger = createScopedLogger('Experiences:PersonalizationDelivery');

type PersonalizationApi = Pick<PersonalizationApiClient, 'upsertProfile'>;
type DeliveryRequest = { profileId?: string; locale?: string };
type QueuedBatch = {
  events: PersonalizationEvent[];
  request?: DeliveryRequest;
  publishing?: boolean;
};
/** A teardown-authorized delivery with a captured identity. */
type QueuedDelivery = { token: object | undefined; profileId?: string };

interface PersonalizationDeliveryOptions {
  readonly api: PersonalizationApi;
  /** Owner-provided state slot; the runtime does not require a signals implementation. */
  readonly personalizationRequestState: { value: PersonalizationRequestState };
  readonly getProfileId: () => string | undefined;
  readonly getProfileRevision: () => number;
  readonly getOnline: () => boolean;
  /** Current content locale for ordinary sends; prepared batches retain their own locale. */
  readonly getLocale?: () => string | undefined;
  readonly eventInterceptors: EventInterceptors;
  readonly publishEvent: (event: PersonalizationEvent) => void;
  /** Owner consent check after interception/schema validation, before publication. */
  readonly admitEvent?: (event: PersonalizationEvent) => boolean;
  /** Publish the response and success state together while the request remains live. */
  readonly applyOptimizationData: (
    data: OptimizationData,
    isCurrent: () => boolean
  ) => void | Promise<void>;
  /** Offline admission capacity: `queuePolicy.offlineMaxEvents`, defaulting to 100 events. */
  readonly maxEvents?: number;
  readonly flushPolicy: ResolvedQueueFlushPolicy;
}

/** In-memory Personalization event queue adapted from Optimization's Personalization queue. */
export class PersonalizationDelivery {
  readonly #api: PersonalizationApi;
  readonly #personalizationRequestState: PersonalizationDeliveryOptions['personalizationRequestState'];
  readonly #getProfileId: PersonalizationDeliveryOptions['getProfileId'];
  readonly #getProfileRevision: PersonalizationDeliveryOptions['getProfileRevision'];
  readonly #getOnline: PersonalizationDeliveryOptions['getOnline'];
  readonly #getLocale: PersonalizationDeliveryOptions['getLocale'];
  readonly #applyOptimizationData: PersonalizationDeliveryOptions['applyOptimizationData'];
  readonly #eventInterceptors: EventInterceptors;
  readonly #publishEvent: PersonalizationDeliveryOptions['publishEvent'];
  readonly #admitEvent: PersonalizationDeliveryOptions['admitEvent'];
  readonly #maxEvents: number;
  readonly #flushRuntime: FlushRuntime;
  readonly #queue: QueuedBatch[] = [];
  #token: object | undefined = {};
  #activeFlush: Promise<void> | undefined;
  #destroying = false;
  #destroyToken: object | undefined;
  #destroyProfileId: string | undefined;

  constructor(options: PersonalizationDeliveryOptions) {
    this.#api = options.api;
    this.#personalizationRequestState = options.personalizationRequestState;
    this.#getProfileId = options.getProfileId;
    this.#getProfileRevision = options.getProfileRevision;
    this.#getOnline = options.getOnline;
    this.#getLocale = options.getLocale;
    this.#applyOptimizationData = options.applyOptimizationData;
    this.#eventInterceptors = options.eventInterceptors;
    this.#publishEvent = options.publishEvent;
    this.#admitEvent = options.admitEvent;
    this.#maxEvents = options.maxEvents ?? OFFLINE_QUEUE_MAX_EVENTS;
    this.#flushRuntime = new FlushRuntime({
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
  async send(
    event: PersonalizationEvent,
    isCurrent: () => boolean = () => true
  ): Promise<EventEmissionResult> {
    if (!this.#isAcceptingEvents()) return { accepted: false };
    if (!isCurrent()) return { accepted: false };
    const token = this.#token;
    const profileRevision = this.#getProfileRevision();
    const intercepted = await this.#eventInterceptors.run(event);
    if (!this.#isLiveRequest(token) || !isCurrent()) return { accepted: false };
    const validEvent = parseOptimizationSchema(PersonalizationEventSchema, intercepted);
    if (this.#admitEvent?.(validEvent) === false || !this.#isLiveRequest(token) || !isCurrent())
      return { accepted: false };
    if (!this.#getOnline() && this.queuedEventCount >= this.#maxEvents) {
      deliveryLogger.warn('Offline Personalization queue is full; event admission was rejected.');
      return { accepted: false };
    }
    this.#publishEvent(validEvent);
    if (!this.#isLiveRequest(token) || !isCurrent()) return { accepted: false };
    if (this.#getOnline()) {
      const data = await this.#upsert([validEvent], undefined, undefined, profileRevision);
      return data === undefined ? { accepted: true } : { accepted: true, data };
    }
    this.#enqueueOrdinary(validEvent);
    return { accepted: true };
  }

  /**
   * Admit an entire prepared batch without waiting for HTTP completion.
   *
   * The batch is already validated: validation, the shared batch limits and consent belong
   * to the emission boundary, which hands the queue the validated type. This only checks
   * that the queue has room, then publishes the reserved events before transport.
   */
  sendPrepared(
    events: readonly PersonalizationEvent[],
    target: { profileId?: string; locale?: string } = {}
  ): EventEmissionResult {
    if (!this.#isAcceptingEvents()) return { accepted: false };
    if (this.queuedEventCount + events.length > this.#maxEvents) {
      return { accepted: false };
    }

    const token = this.#token;
    const submission: QueuedBatch = {
      events: [...events],
      request: { profileId: target.profileId ?? this.#getProfileId(), locale: target.locale },
      publishing: true,
    };
    this.#queue.push(submission);
    for (const event of submission.events) {
      if (!this.#isLiveRequest(token)) return { accepted: false };
      this.#publishEvent(event);
    }
    if (!this.#isLiveRequest(token)) return { accepted: false };
    submission.publishing = false;
    void this.flush();
    return { accepted: this.#isLiveRequest(token) };
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
    if (this.#queue[0]?.publishing) return;

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
    // A subscriber may destroy the owner during prepared publication. Only fully
    // published batches are eligible for the best-effort teardown drain.
    for (let index = this.#queue.length - 1; index >= 0; index--) {
      if (this.#queue[index]?.publishing) this.#queue.splice(index, 1);
    }
    this.#destroyToken = this.#token;
    this.#destroyProfileId = this.#getProfileId();
    this.#destroying = true;
    this.#personalizationRequestState.value = { status: 'idle' };
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
    if (!this.#destroying) this.#personalizationRequestState.value = { status: 'idle' };
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
      if (first === undefined || first.publishing) break;
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

  #enqueueOrdinary(event: PersonalizationEvent): void {
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
    events: PersonalizationEvent[],
    request: DeliveryRequest | undefined,
    delivery: QueuedDelivery | undefined,
    profileRevision = this.#getProfileRevision()
  ): Promise<OptimizationData | undefined> {
    const token = this.#token;
    const isLive = (): boolean => this.#isLiveRequest(token);
    const canPublish = (): boolean => isLive() && profileRevision === this.#getProfileRevision();
    const isDestroyDrain = (): boolean => this.#isDestroyDeliveryCurrent(delivery);
    const isAccepted = (): boolean => isLive() || isDestroyDrain();
    if (isLive()) this.#personalizationRequestState.value = { status: 'pending' };
    if (!isAccepted()) return undefined;
    try {
      const data = await this.#requestPersonalizationData(events, request, delivery?.profileId);
      if (!isAccepted()) return undefined;
      if (request !== undefined) request.profileId ??= data.profile.id;
      if (canPublish()) await this.#applyOptimizationData(data, canPublish);
      if (isLive() && this.#personalizationRequestState.value.status !== 'success')
        this.#personalizationRequestState.value = { status: 'success' };
      return isAccepted() ? data : undefined;
    } catch (error) {
      if (!isAccepted()) return undefined;
      if (isLive()) {
        this.#personalizationRequestState.value = {
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
  #requestPersonalizationData(
    events: PersonalizationEvent[],
    request: DeliveryRequest | undefined,
    continuationProfileId: string | undefined
  ): Promise<OptimizationData> {
    const profileId =
      request?.profileId ??
      continuationProfileId ??
      (this.#destroying ? this.#destroyProfileId : this.#getProfileId());
    if (request !== undefined) request.profileId = profileId;
    return this.#api.upsertProfile(
      { profileId, events: [...events] },
      request === undefined
        ? { locale: this.#getLocale?.() }
        : { preflight: false, locale: request.locale }
    );
  }
}
