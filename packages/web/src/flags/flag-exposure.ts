import { resolveFlagChange, type Json, type BlockedEvent } from '@contentful/experiences-runtime';
import { computed, untracked } from '@preact/signals-core';
import { cloneDeep } from 'es-toolkit';
import { isEqual } from 'es-toolkit/predicate';
import {
  effect,
  consent as consentSignal,
  changes as changesSignal,
  profile as profileSignal,
  toDistinctObservable,
  type Observable,
  type Subscription,
} from '../signals/index.js';
import type { ContentfulExperiences } from '../sdk/contentful-experiences.js';

/** Flag exposure bookkeeping for one SDK, independent of its lifecycle authority. */
export class FlagExposure {
  readonly #acceptedFlagViews = new Map<string, { id: number; signature: readonly unknown[] }>();
  readonly #pendingFlagViews = new Map<string, { id: number; signature: readonly unknown[] }[]>();
  readonly #activeFlags = new Map<string, number>();
  #flagAttemptId = 0;
  readonly #sdk: Pick<
    ContentfulExperiences,
    'isPreview' | 'hasConsent' | 'trackFlagView' | 'getFlag'
  >;
  readonly #getToken: () => object | undefined;
  readonly #reportBlockedEvent: (event: BlockedEvent) => void;

  constructor(
    sdk: Pick<ContentfulExperiences, 'isPreview' | 'hasConsent' | 'trackFlagView' | 'getFlag'>,
    getToken: () => object | undefined,
    reportBlockedEvent: (event: BlockedEvent) => void
  ) {
    this.#sdk = sdk;
    this.#getToken = getToken;
    this.#reportBlockedEvent = reportBlockedEvent;
  }

  read(name: string, changes: readonly unknown[] | undefined): Json | undefined {
    const selected = resolveFlagChange(name, changes);
    untracked(() => this.attempt(name, selected));
    return selected?.value;
  }

  installRetryEffect(): () => void {
    return effect(() => {
      void changesSignal.value;
      void profileSignal.value;
      void consentSignal.value;
      untracked(() => this.retryActive());
    });
  }

  clearAttempts(): void {
    this.#pendingFlagViews.clear();
    this.#acceptedFlagViews.clear();
  }

  destroy(): void {
    this.clearAttempts();
    this.#activeFlags.clear();
  }

  #isCurrent(token: object | undefined): boolean {
    return token !== undefined && this.#getToken() === token;
  }

  #eligibleFlagProfileId(): string | undefined {
    if (
      this.#getToken() === undefined ||
      this.#sdk.isPreview ||
      !this.#sdk.hasConsent('trackFlagView')
    )
      return;
    return profileSignal.peek()?.id;
  }

  attempt(name: string, selected: ReturnType<typeof resolveFlagChange>): void {
    if (this.#getToken() === undefined || this.#sdk.isPreview) return;
    const payload = {
      componentId: name,
      experienceId: selected?.meta.experienceId,
      variantIndex: selected?.meta.variantIndex,
    };
    if (!this.#sdk.hasConsent('trackFlagView')) {
      this.#reportBlockedEvent({ reason: 'consent', method: 'trackFlagView', args: [payload] });
      return;
    }
    const profileId = this.#eligibleFlagProfileId();
    if (profileId === undefined) return;
    const signature = [
      selected?.value,
      name,
      payload.experienceId,
      payload.variantIndex,
      profileId,
    ];
    if (isEqual(this.#acceptedFlagViews.get(name)?.signature, signature)) return;
    let pending = this.#pendingFlagViews.get(name);
    if (pending?.some((attempt) => isEqual(attempt.signature, signature))) return;
    pending ??= [];
    this.#pendingFlagViews.set(name, pending);
    const attempt = { id: this.#flagAttemptId++, signature: cloneDeep(signature) };
    pending.push(attempt);
    const token = this.#getToken();
    void this.#sdk
      .trackFlagView(payload)
      .then((result) => {
        if (
          !result.accepted ||
          !this.#isCurrent(token) ||
          this.#pendingFlagViews.get(name) !== pending
        )
          return;
        const accepted = this.#acceptedFlagViews.get(name);
        if (!accepted || attempt.id > accepted.id) this.#acceptedFlagViews.set(name, attempt);
      })
      .catch((error: unknown) => console.warn('Flag view failed', error))
      .finally(() => {
        const index = pending.indexOf(attempt);
        if (index !== -1) pending.splice(index, 1);
        if (pending.length === 0 && this.#pendingFlagViews.get(name) === pending)
          this.#pendingFlagViews.delete(name);
      });
  }

  retryActive(): void {
    if (this.#eligibleFlagProfileId() === undefined) return;
    const token = this.#getToken();
    const changes = changesSignal.peek();
    for (const name of [...this.#activeFlags.keys()]) {
      if (!this.#isCurrent(token)) return;
      this.attempt(name, resolveFlagChange(name, changes));
    }
  }

  observable(name: string): Observable<Json | undefined> {
    const selected = computed(() => resolveFlagChange(name, changesSignal.value));
    const values = toDistinctObservable(
      computed(() => selected.value?.value),
      isEqual
    );
    const read = (): Json | undefined => {
      const winner = selected.value;
      untracked(() => this.attempt(name, winner));
      return values.current;
    };
    const register = (): (() => void) => {
      if (this.#getToken() === undefined) return () => undefined;
      this.#activeFlags.set(name, (this.#activeFlags.get(name) ?? 0) + 1);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        const count = (this.#activeFlags.get(name) ?? 0) - 1;
        if (count <= 0) this.#activeFlags.delete(name);
        else this.#activeFlags.set(name, count);
      };
    };
    const subscribe = <T>(
      start: (next: (value: T) => void) => Subscription,
      next: (value: T) => void,
      once = false
    ): Subscription => {
      const unregister = register();
      try {
        // A missing one-shot value remains active until the first non-nullish value or cleanup.
        if (once) this.#sdk.getFlag(name);
        const subscription = start((value) => {
          if (once) unregister();
          this.#sdk.getFlag(name);
          next(value);
        });
        return {
          unsubscribe: () => {
            subscription.unsubscribe();
            unregister();
          },
        };
      } catch (error) {
        unregister();
        throw error;
      }
    };
    return {
      get current() {
        return read();
      },
      subscribe: (next) => subscribe(values.subscribe, next),
      subscribeOnce: (next) => subscribe(values.subscribeOnce, next, true),
    };
  }
}
