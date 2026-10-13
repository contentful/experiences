import type { EventEmissionResult } from '@contentful/experiences-runtime';

/** Tracks the latest accepted route and owns one ordinary page attempt at a time. */
export class AcceptedCurrentPageTracker {
  #accepted: { routeKey: string } | undefined;
  #inFlight: { routeKey: string } | undefined;

  hasAccepted(): boolean {
    return this.#accepted !== undefined;
  }

  markAccepted(routeKey: string): void {
    this.#accepted = { routeKey };
  }

  reset(): void {
    this.#accepted = undefined;
    this.#inFlight = undefined;
  }

  async emitIfNeeded(
    routeKey: string,
    emit: () => Promise<EventEmissionResult>
  ): Promise<EventEmissionResult> {
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
