import type { InsightsApiClientRequestOptions } from '@contentful/optimization-api-client';
import type {
  BatchInsightsEventArray,
  InsightsEvent as AnalyticsEvent,
  PartialProfile as EventProfile,
} from '@contentful/optimization-api-client/api-schemas';
import { createScopedLogger } from '@contentful/optimization-api-client/logger';
import {
  QueueFlushRuntime,
  resolveQueueFlushPolicy,
  type QueueFlushPolicy,
  type ResolvedQueueFlushPolicy,
} from './lib/queue/index.js';
import type { RuntimeOptimizationApiClient } from './runtime-event-methods.js';

const deliveryLogger = createScopedLogger('Experiences:AnalyticsDelivery');

/** Optimization's InsightsQueue size limit: reaching it flushes immediately. */
export const MAX_QUEUED_ANALYTICS_EVENTS = 25;

type AnalyticsApi = RuntimeOptimizationApiClient['analytics'];
type QueuedProfileEvents = { profile: EventProfile; events: AnalyticsEvent[] };

interface AnalyticsDeliveryOptions {
  readonly api: AnalyticsApi;
  readonly getOnline: () => boolean;
  /** Internal override for deterministic tests. */
  readonly maxEvents?: number;
  readonly flushPolicy?: QueueFlushPolicy;
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
  #activeFlush: Promise<void> | undefined;
  #periodicTimer: ReturnType<typeof setInterval> | undefined;
  #token: object | undefined = {};

  constructor(options: AnalyticsDeliveryOptions) {
    this.#api = options.api;
    this.#getOnline = options.getOnline;
    this.#maxEvents = options.maxEvents ?? MAX_QUEUED_ANALYTICS_EVENTS;
    const policy: ResolvedQueueFlushPolicy = resolveQueueFlushPolicy(options.flushPolicy);
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

  /** Queue one event; reaching the size limit flushes before resolving. */
  async send(event: AnalyticsEvent, profile: EventProfile): Promise<boolean> {
    if (this.#token === undefined) return false;

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
    return true;
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
    const token = this.#token;
    if (token === undefined) return;
    if (this.#flushRuntime.shouldSkip({ force, isOnline: this.#getOnline() })) return;

    // Snapshot how many events each profile contributes so that events queued while the
    // request is in flight are kept, not dropped with the batch that was sent.
    const sent = new Map<string, number>();
    const batches: BatchInsightsEventArray = [];
    this.#queued.forEach(({ profile, events }, id) => {
      sent.set(id, events.length);
      batches.push({ profile, events: [...events] });
    });

    if (batches.length === 0) {
      this.#flushRuntime.clearScheduledRetry();
      this.#reconcilePeriodicTimer();
      return;
    }

    const attempt = this.#flushAttempt(batches, sent, beacon, token);
    this.#activeFlush = attempt;
    try {
      await attempt;
    } finally {
      if (this.#activeFlush === attempt) this.#activeFlush = undefined;
    }
  }

  async #flushAttempt(
    batches: BatchInsightsEventArray,
    sent: ReadonlyMap<string, number>,
    beacon: AnalyticsFlushOptions['beacon'],
    token: object
  ): Promise<void> {
    this.#flushRuntime.markFlushStarted();
    const isCurrent = (): boolean => token === this.#token;
    try {
      const success = await this.#trySend(batches, beacon ? { beacon } : undefined);
      if (!isCurrent()) return;
      if (success) {
        this.#discardSent(sent);
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
   * Drops queued events and cancels retries and the periodic timer, leaving the delivery
   * live. A request on the wire cannot be recalled, but it no longer affects this queue.
   * Used when event consent is withdrawn and on `reset()`.
   */
  clearQueue(): void {
    if (this.#token === undefined) return;
    this.#token = {};
    this.#activeFlush = undefined;
    this.#queued.clear();
    this.#flushRuntime.reset();
    this.#clearPeriodicTimer();
  }

  reset(): void {
    this.clearQueue();
  }

  /** Make a final forced attempt at queued events, then stop accepting new ones. */
  destroy(): void {
    if (this.#token === undefined) return;
    this.#flushRuntime.clearScheduledRetry();
    this.#clearPeriodicTimer();
    const drain = this.flush({ force: true });
    this.#token = undefined;
    void drain.catch(() => undefined).finally(() => this.#queued.clear());
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

  #discardSent(sent: ReadonlyMap<string, number>): void {
    sent.forEach((count, id) => {
      const queued = this.#queued.get(id);
      if (queued === undefined) return;
      queued.events.splice(0, count);
      if (queued.events.length === 0) this.#queued.delete(id);
    });
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
