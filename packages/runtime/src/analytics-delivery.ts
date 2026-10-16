import type { InsightsApiClientRequestOptions } from '@contentful/optimization-api-client';
import type {
  BatchInsightsEventArray,
  InsightsEvent as AnalyticsEvent,
  PartialProfile as EventProfile,
} from '@contentful/optimization-api-client/api-schemas';
import { createScopedLogger } from '@contentful/optimization-api-client/logger';
import { QueueFlushRuntime, type ResolvedQueueFlushPolicy } from './lib/queue/index.js';
import type { RuntimeOptimizationApiClient } from './runtime-event-methods.js';

const deliveryLogger = createScopedLogger('Experiences:AnalyticsDelivery');

/** Optimization's InsightsQueue size limit: reaching it flushes immediately. */
export const MAX_QUEUED_ANALYTICS_EVENTS = 25;

type AnalyticsApi = RuntimeOptimizationApiClient['analytics'];
type QueuedProfileEvents = { profile: EventProfile; events: AnalyticsEvent[] };

interface AnalyticsDeliveryOptions {
  readonly api: AnalyticsApi;
  readonly getOnline: () => boolean;
  /**
   * The owning runtime's lifecycle token, as in Optimization's InsightsQueue. The owner
   * replaces it to invalidate in-flight work and returns `undefined` once destroyed; the
   * queue has no lifecycle of its own.
   */
  readonly getResetToken?: () => object | undefined;
  /** Internal override for deterministic tests. */
  readonly maxEvents?: number;
  readonly flushPolicy: ResolvedQueueFlushPolicy;
}

export interface AnalyticsFlushOptions extends InsightsApiClientRequestOptions {
  force?: boolean;
}

/**
 * In-memory Analytics event queue adapted from Optimization's InsightsQueue.
 *
 * Events are grouped per profile and flushed when the queue reaches its size limit, on a
 * periodic timer while events remain queued, and when the owner calls `flush()` (coming
 * online, page hide). Failed flushes retry with the shared backoff and circuit policy.
 */
export class AnalyticsDelivery {
  readonly #api: AnalyticsApi;
  readonly #getOnline: AnalyticsDeliveryOptions['getOnline'];
  readonly #maxEvents: number;
  readonly #flushIntervalMs: number;
  readonly #flushRuntime: QueueFlushRuntime;
  readonly #queued = new Map<string, QueuedProfileEvents>();
  readonly #getResetToken: () => object | undefined;
  #activeFlush: Promise<void> | undefined;
  #periodicTimer: ReturnType<typeof setInterval> | undefined;

  constructor(options: AnalyticsDeliveryOptions) {
    this.#api = options.api;
    this.#getOnline = options.getOnline;
    this.#getResetToken = options.getResetToken ?? (() => this);
    this.#maxEvents = options.maxEvents ?? MAX_QUEUED_ANALYTICS_EVENTS;
    const policy = options.flushPolicy;
    this.#flushIntervalMs = policy.flushIntervalMs;
    this.#flushRuntime = new QueueFlushRuntime({
      policy,
      onRetry: () => {
        void this.flush();
      },
      onCallbackError: (callbackName, error) => {
        deliveryLogger.warn(`Analytics flush policy callback "${callbackName}" failed`, error);
      },
    });
  }

  get queuedEventCount(): number {
    let count = 0;
    this.#queued.forEach(({ events }) => {
      count += events.length;
    });
    return count;
  }

  /**
   * Queue one event. Reaching the size limit awaits the triggered flush, as Optimization's
   * InsightsQueue does. Like Optimization, the call resolves with no result: a failed
   * flush keeps its events for retry and is not reported through the return value.
   */
  async send(event: AnalyticsEvent, profile: EventProfile): Promise<void> {
    const token = this.#getResetToken();
    if (token === undefined) return;

    const queued = this.#queued.get(profile.id);
    if (queued) {
      queued.profile = profile;
      queued.events.push(event);
    } else {
      this.#queued.set(profile.id, { profile, events: [event] });
    }

    this.#ensurePeriodicTimer();
    if (this.queuedEventCount >= this.#maxEvents) await this.flush();
    this.#reconcilePeriodicTimer();
  }

  clearScheduledRetry(): void {
    this.#flushRuntime.clearScheduledRetry();
  }

  async flush({ force = false, beacon }: AnalyticsFlushOptions = {}): Promise<void> {
    // Join an attempt already on the wire instead of returning early: a caller awaiting
    // flush() waits for that attempt to settle. This starts nothing new, so it is not a
    // guarantee of eventual delivery, and scheduled retries stay independent.
    if (this.#activeFlush !== undefined) {
      await this.#activeFlush;
      return;
    }
    if (
      this.#flushRuntime.shouldSkip({
        force,
        isOnline: this.#getOnline() && this.#getResetToken() !== undefined,
      })
    ) {
      return;
    }

    const batches = this.#createBatches();

    if (batches.length === 0) {
      this.#flushRuntime.clearScheduledRetry();
      this.#reconcilePeriodicTimer();
      return;
    }

    const token = this.#getResetToken();
    const attempt = this.#flushAttempt(batches, beacon, token);
    this.#activeFlush = attempt;
    try {
      await attempt;
    } finally {
      if (this.#activeFlush === attempt) this.#activeFlush = undefined;
    }
  }

  async #flushAttempt(
    batches: BatchInsightsEventArray,
    beacon: AnalyticsFlushOptions['beacon'],
    token: object | undefined
  ): Promise<void> {
    this.#flushRuntime.markFlushStarted();
    const isCurrent = (): boolean => token !== undefined && token === this.#getResetToken();
    try {
      const success = await this.#trySend(batches, beacon ? { beacon } : undefined);
      if (!isCurrent()) return;
      if (success) {
        this.#removeSentEvents(batches);
        this.#flushRuntime.handleFlushSuccess();
      } else {
        this.#flushRuntime.handleFlushFailure({
          queuedBatches: batches.length,
          queuedEvents: this.queuedEventCount,
        });
      }
    } finally {
      if (isCurrent()) {
        this.#flushRuntime.markFlushFinished();
        this.#reconcilePeriodicTimer();
      }
    }
  }

  /**
   * Drop queued events and reset retry state, as Optimization's
   * InsightsQueue.clearQueuedEvents(). The owner invalidates in-flight work by replacing
   * its reset token; a request on the wire cannot be recalled but can no longer apply.
   */
  clearQueuedEvents(): void {
    this.#queued.clear();
    this.#flushRuntime.reset();
    this.#activeFlush = undefined;
    this.#reconcilePeriodicTimer();
  }

  /** Cancel the periodic flush timer, as Optimization's InsightsQueue does on destroy. */
  clearPeriodicFlushTimer(): void {
    this.#clearPeriodicTimer();
  }

  async #trySend(
    batches: BatchInsightsEventArray,
    options: InsightsApiClientRequestOptions | undefined
  ): Promise<boolean> {
    try {
      return options === undefined
        ? await this.#api.sendBatchEvents(batches)
        : await this.#api.sendBatchEvents(batches, options);
    } catch (error) {
      deliveryLogger.warn('Analytics queue flush request threw an error', error);
      return false;
    }
  }

  #removeSentEvents(batches: BatchInsightsEventArray): void {
    for (const { profile, events } of batches) {
      const queued = this.#queued.get(profile.id);
      if (queued === undefined) continue;
      queued.events.splice(0, events.length);
      if (queued.events.length === 0) this.#queued.delete(profile.id);
    }
  }

  #createBatches(): BatchInsightsEventArray {
    const batches: BatchInsightsEventArray = [];
    this.#queued.forEach(({ profile, events }) => {
      batches.push({ profile, events: [...events] });
    });
    return batches;
  }

  #ensurePeriodicTimer(): void {
    if (this.#periodicTimer !== undefined || this.queuedEventCount === 0) return;
    this.#periodicTimer = setInterval(() => void this.flush(), this.#flushIntervalMs);
  }

  #reconcilePeriodicTimer(): void {
    if (this.queuedEventCount > 0) this.#ensurePeriodicTimer();
    else this.#clearPeriodicTimer();
  }

  #clearPeriodicTimer(): void {
    if (this.#periodicTimer === undefined) return;
    clearInterval(this.#periodicTimer);
    this.#periodicTimer = undefined;
  }
}
