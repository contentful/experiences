/** Relevant Optimization ExperienceQueue retry defaults; there is no periodic Personalization timer. */
export const DEFAULT_PERSONALIZATION_FLUSH_POLICY = {
  baseBackoffMs: 500,
  maxBackoffMs: 30_000,
  jitterRatio: 0.2,
  maxConsecutiveFailures: 8,
  circuitOpenMs: 120_000,
} as const;

export type PersonalizationFlushPolicy = {
  readonly [K in keyof typeof DEFAULT_PERSONALIZATION_FLUSH_POLICY]: number;
};

/** Small state machine adapted from Optimization's QueueFlushRuntime and flushPolicy. */
export class PersonalizationFlushRuntime {
  #circuitOpenUntil = 0;
  #failureCount = 0;
  #flushInFlight = false;
  #nextFlushAllowedAt = 0;
  #retryTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly onRetry: () => void,
    private readonly policy: PersonalizationFlushPolicy = DEFAULT_PERSONALIZATION_FLUSH_POLICY
  ) {}

  reset(): void {
    this.clearScheduledRetry();
    this.#circuitOpenUntil = 0;
    this.#failureCount = 0;
    this.#flushInFlight = false;
    this.#nextFlushAllowedAt = 0;
  }

  clearScheduledRetry(): void {
    if (this.#retryTimer === undefined) return;
    clearTimeout(this.#retryTimer);
    this.#retryTimer = undefined;
  }

  shouldSkip({ force, isOnline }: { force: boolean; isOnline: boolean }): boolean {
    if (this.#flushInFlight) return true;
    if (force) return false;
    if (!isOnline) return true;
    const now = Date.now();
    return this.#nextFlushAllowedAt > now || this.#circuitOpenUntil > now;
  }

  markFlushStarted(): void {
    this.#flushInFlight = true;
  }

  markFlushFinished(): void {
    this.#flushInFlight = false;
  }

  handleFlushSuccess(): void {
    this.clearScheduledRetry();
    this.#circuitOpenUntil = 0;
    this.#failureCount = 0;
    this.#nextFlushAllowedAt = 0;
  }

  handleFlushFailure(): void {
    this.#failureCount += 1;
    const exponential = this.policy.baseBackoffMs * 2 ** Math.max(0, this.#failureCount - 1);
    const capped = Math.min(this.policy.maxBackoffMs, exponential);
    const retryDelayMs = Math.round(capped + capped * this.policy.jitterRatio * Math.random());
    const now = Date.now();
    const circuitOpen = this.#failureCount >= this.policy.maxConsecutiveFailures;
    const delay = circuitOpen ? this.policy.circuitOpenMs : retryDelayMs;
    this.#nextFlushAllowedAt = now + delay;
    this.#circuitOpenUntil = circuitOpen ? now + delay : 0;
    this.clearScheduledRetry();
    this.#retryTimer = setTimeout(() => {
      this.#retryTimer = undefined;
      this.onRetry();
    }, delay);
  }
}
