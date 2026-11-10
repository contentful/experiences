import { resolveFlagChange, type Json } from '@contentful/experiences-runtime';
import { computed, untracked } from '@preact/signals-core';
import { cloneDeep } from 'es-toolkit';
import { isEqual } from 'es-toolkit/predicate';
import {
  changes as changesSignal,
  profile as profileSignal,
  consent as consentSignal,
  effect,
  toDistinctObservable,
  type Observable,
  type Subscription,
} from '../signals/index.js';
import { StatefulRuntime } from './stateful-runtime.js';

/** Automatic flag exposure and key-scoped reactive reads share this SDK's event and state owner. */
export abstract class FlagRuntime extends StatefulRuntime {
  private readonly acceptedFlagViews = new Map<
    string,
    { id: number; signature: readonly unknown[] }
  >();
  private readonly pendingFlagViews = new Map<
    string,
    { id: number; signature: readonly unknown[] }[]
  >();
  private readonly activeFlags = new Map<string, number>();
  private flagAttemptId = 0;

  protected clearFlagViews(clearActive = false): void {
    this.pendingFlagViews.clear();
    this.acceptedFlagViews.clear();
    if (clearActive) this.activeFlags.clear();
  }

  protected override initializeEffects(): void {
    super.initializeEffects();
    this.effects.push(
      effect(() => {
        void changesSignal.value;
        void profileSignal.value;
        void consentSignal.value;
        untracked(() => this.retryActiveFlagViews());
      })
    );
  }

  /** Read a Custom Flag and track its selected value and attribution. */
  override getFlag(
    name: string,
    changes: readonly unknown[] | undefined = changesSignal.value
  ): Json | undefined {
    const selected = resolveFlagChange(name, changes);
    untracked(() => this.attemptFlagView(name, selected));
    return selected?.value;
  }

  private eligibleFlagProfileId(): string | undefined {
    if (this.destroyed || this.isPreview || !this.hasConsent('trackFlagView')) return;
    return profileSignal.peek()?.id;
  }

  private attemptFlagView(name: string, selected: ReturnType<typeof resolveFlagChange>): void {
    if (this.destroyed || this.isPreview) return;
    const payload = {
      componentId: name,
      experienceId: selected?.meta.experienceId,
      variantIndex: selected?.meta.variantIndex,
    };
    if (!this.hasConsent('trackFlagView')) {
      this.reportBlockedEvent({ reason: 'consent', method: 'trackFlagView', args: [payload] });
      return;
    }
    const profileId = this.eligibleFlagProfileId();
    if (profileId === undefined) return;
    const signature = [
      selected?.value,
      name,
      payload.experienceId,
      payload.variantIndex,
      profileId,
    ];
    if (isEqual(this.acceptedFlagViews.get(name)?.signature, signature)) return;
    let pending = this.pendingFlagViews.get(name);
    if (pending?.some((attempt) => isEqual(attempt.signature, signature))) return;
    pending ??= [];
    this.pendingFlagViews.set(name, pending);
    const attempt = { id: this.flagAttemptId++, signature: cloneDeep(signature) };
    pending.push(attempt);
    const token = this.resetToken;
    void this.trackFlagView(payload)
      .then((result) => {
        if (
          !result.accepted ||
          !this.isCurrent(token) ||
          this.pendingFlagViews.get(name) !== pending
        )
          return;
        const accepted = this.acceptedFlagViews.get(name);
        if (!accepted || attempt.id > accepted.id) this.acceptedFlagViews.set(name, attempt);
      })
      .catch((error: unknown) => console.warn('Flag view failed', error))
      .finally(() => {
        const index = pending.indexOf(attempt);
        if (index !== -1) pending.splice(index, 1);
        if (pending.length === 0 && this.pendingFlagViews.get(name) === pending)
          this.pendingFlagViews.delete(name);
      });
  }

  protected retryActiveFlagViews(): void {
    if (this.eligibleFlagProfileId() === undefined) return;
    const token = this.resetToken;
    const changes = changesSignal.peek();
    for (const name of [...this.activeFlags.keys()]) {
      if (!this.isCurrent(token)) return;
      this.attemptFlagView(name, resolveFlagChange(name, changes));
    }
  }

  protected flagObservable(name: string): Observable<Json | undefined> {
    const selected = computed(() => resolveFlagChange(name, changesSignal.value));
    const values = toDistinctObservable(
      computed(() => selected.value?.value),
      isEqual
    );
    const read = (): Json | undefined => {
      const winner = selected.value;
      untracked(() => this.attemptFlagView(name, winner));
      return values.current;
    };
    const register = (): (() => void) => {
      if (this.destroyed) return () => undefined;
      this.activeFlags.set(name, (this.activeFlags.get(name) ?? 0) + 1);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        const count = (this.activeFlags.get(name) ?? 0) - 1;
        if (count <= 0) this.activeFlags.delete(name);
        else this.activeFlags.set(name, count);
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
        if (once) this.getFlag(name);
        const subscription = start((value) => {
          if (once) unregister();
          this.getFlag(name);
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
