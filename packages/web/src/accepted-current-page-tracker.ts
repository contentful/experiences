import type { EventEmissionResult } from '@contentful/experiences-runtime';

/** Tracks the latest accepted route and owns one ordinary page attempt at a time. */
export class AcceptedCurrentPageTracker {
  #accepted: { routeKey: string } | undefined;
  #inFlight:
    | {
        routeKey: string;
        isCurrent?: () => boolean;
        admission?: Promise<boolean | undefined>;
        finish?: (accepted?: boolean) => void;
      }
    | undefined;

  hasAccepted(): boolean {
    return this.#accepted !== undefined;
  }

  markAccepted(routeKey: string): void {
    this.#accepted = { routeKey };
  }

  /** Reserve the existing attempt slot until content event preparation decides admission. */
  prepare(routeKey: string, isCurrent?: () => boolean): (accepted?: boolean) => void {
    this.#inFlight?.finish?.();
    let resolve!: (accepted: boolean | undefined) => void;
    const attempt = {
      routeKey,
      isCurrent,
      admission: new Promise<boolean | undefined>((complete) => {
        resolve = complete;
      }),
      finish: (accepted?: boolean) => {
        if (this.#inFlight !== attempt) return;
        this.#inFlight = undefined;
        if (accepted) this.markAccepted(routeKey);
        resolve(accepted);
      },
    };
    this.#inFlight = attempt;
    return attempt.finish;
  }

  reset(): void {
    this.#inFlight?.finish?.();
    this.#accepted = undefined;
    this.#inFlight = undefined;
  }

  async emitIfNeeded(
    routeKey: string,
    emit: () => Promise<EventEmissionResult>
  ): Promise<EventEmissionResult> {
    const pending = this.#inFlight;
    if (pending?.admission) {
      if (pending.routeKey !== routeKey || pending.isCurrent?.() === false) pending.finish?.();
      else if ((await pending.admission) !== false) return { accepted: false };
    }
    if (this.#accepted?.routeKey === routeKey || this.#inFlight?.routeKey === routeKey) {
      return { accepted: false };
    }

    const attempt = { routeKey };
    this.#inFlight = attempt;
    try {
      const result = await emit();
      if (result.accepted && this.#inFlight === attempt) this.markAccepted(routeKey);
      return result;
    } finally {
      if (this.#inFlight === attempt) this.#inFlight = undefined;
    }
  }
}
