/*
 * Debug logging for the SDK. The whole surface is gated on a single `debug`
 * boolean that threads through `fetchExperience` / `resolveExperience` and the
 * renderers (see `ExperienceContext.debug`). When `debug` is off, every call
 * here is a cheap no-op — nothing is logged, no strings are built (callers pass
 * thunks for anything expensive to serialize).
 *
 * This is intentionally console-based, not a pluggable logger. v1 goal is
 * "turn it on, see what the SDK is doing"; a customer-supplied sink can land
 * later without changing call sites (the `debug` boolean would widen to
 * `boolean | DebugSink`).
 */

/** Prefix on every debug line so customers can filter their console. */
const PREFIX = '[experiences:debug]';

/**
 * Monotonic-ish clock for span timings. Prefers `performance.now()` (present
 * in modern Node and every browser); falls back to `Date.now()`. Returns 0
 * when neither is available so timing degrades to "no duration" rather than
 * throwing.
 */
function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  if (typeof Date !== 'undefined' && typeof Date.now === 'function') return Date.now();
  return 0;
}

/**
 * A scoped debug logger. `scope` names the emitting subsystem (e.g. `core`,
 * `client`, `react`) so interleaved logs stay legible.
 */
export interface DebugLogger {
  /** Log a message with optional structured data. */
  log(message: string, data?: unknown): void;
  /**
   * Log a message whose payload is expensive to build. The thunk only runs
   * when debug is enabled — keep large payload serialization out of the hot
   * path when debug is off.
   */
  lazy(message: string, getData: () => unknown): void;
  /** Time an async span and log its duration when it settles. */
  time<T>(label: string, fn: () => Promise<T>): Promise<T>;
  /** True when this logger is actually emitting. */
  readonly enabled: boolean;
}

const NOOP_LOGGER: DebugLogger = {
  log() {},
  lazy() {},
  time: (_label, fn) => fn(),
  enabled: false,
};

/**
 * Build a debug logger. Returns a shared no-op when `debug` is falsy so
 * callers can hold onto the result unconditionally and pay nothing when off.
 */
export function createDebugLogger(debug: boolean | undefined, scope: string): DebugLogger {
  if (!debug || typeof console === 'undefined') return NOOP_LOGGER;

  const tag = `${PREFIX}[${scope}]`;
  return {
    enabled: true,
    log(message, data) {
      if (data === undefined) console.log(`${tag} ${message}`);
      else console.log(`${tag} ${message}`, data);
    },
    lazy(message, getData) {
      console.log(`${tag} ${message}`, getData());
    },
    async time(label, fn) {
      const start = now();
      try {
        const result = await fn();
        console.log(`${tag} ⏱ ${label} — ${(now() - start).toFixed(1)}ms`);
        return result;
      } catch (err) {
        console.log(`${tag} ⏱ ${label} — failed after ${(now() - start).toFixed(1)}ms`, err);
        throw err;
      }
    },
  };
}
