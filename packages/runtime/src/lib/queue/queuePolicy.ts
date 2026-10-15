import { toPositiveInt } from '../number/index.js';
import { resolveQueueFlushPolicy, type QueueFlushPolicy } from './flushPolicy.js';

/**
 * Default maximum number of offline Experience events admitted.
 *
 * @internal
 */
export const OFFLINE_QUEUE_MAX_EVENTS = 100;

/**
 * Unified queue policy for stateful runtimes.
 *
 * @public
 */
export interface QueuePolicy {
  /** Shared retry/backoff/circuit policy for queued flushes. */
  flush?: QueueFlushPolicy;
  /** Maximum number of offline Experience events admitted. */
  offlineMaxEvents?: number;
}

/**
 * Resolved queue policy values.
 *
 * @internal
 */
export interface ResolvedQueuePolicy {
  flush: ReturnType<typeof resolveQueueFlushPolicy>;
  offlineMaxEvents: number;
}

/**
 * Resolve and normalize queue policy values.
 *
 * @internal
 */
export const resolveQueuePolicy = (policy: QueuePolicy | undefined): ResolvedQueuePolicy => ({
  flush: resolveQueueFlushPolicy(policy?.flush),
  offlineMaxEvents: toPositiveInt(policy?.offlineMaxEvents, OFFLINE_QUEUE_MAX_EVENTS),
});
