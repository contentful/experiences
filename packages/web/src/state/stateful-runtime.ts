import {
  type AnalyticsFlushOptions,
  type ConsentInput,
  type ConsentState,
  EventProfileSchema,
  InterceptorManager,
  ChangeArray,
  type Json,
  toConsentState,
} from '@contentful/experiences-runtime';
import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';
import { signal, untracked } from '@preact/signals-core';
import { isEqual } from 'es-toolkit/predicate';
import {
  batch,
  changes as changesSignal,
  type Observable,
  blockedEvent as blockedEventSignal,
  consent as consentSignal,
  effect,
  event as eventSignal,
  personalizationRequestState as personalizationRequestStateSignal,
  locale as localeSignal,
  online as onlineSignal,
  persistenceConsent as persistenceConsentSignal,
  preview as previewSignal,
  profile as profileSignal,
  toObservable,
} from '../signals/index.js';
import {
  type PersonalizationState,
  type LifecycleInterceptors,
  mergePersonalizationState,
} from './interceptors.js';
import { normalizeExplicitLocale } from './locale.js';
import { resolveStatefulDefaults, type StatefulDefaults } from './stateful-defaults.js';
import type { States } from './states.js';

import { type CookieSnapshot, IdentityCookie } from '../browser/identity-cookie.js';
import LocalStore from '../storage/local-store.js';

import { EventEmitter } from '../events/emitter.js';
import type { Config } from '../sdk/types.js';

/** Stateful browser identity, observables and policy shared by the SDK's inherited operations. */
export abstract class StatefulRuntime extends EventEmitter {
  protected abstract withdrawEventConsent(): void;
  protected abstract syncTrackingConsent(): void;
  protected abstract flushQueues(
    options?: AnalyticsFlushOptions,
    isCurrent?: () => boolean
  ): Promise<void>;
  abstract reset(): void;
  protected abstract flagObservable(name: string): Observable<Json | undefined>;
  protected abstract clearFlagViews(clearActive?: boolean): void;
  protected abstract retryActiveFlagViews(): void;

  protected contentLifetime = 0;
  protected stateRevision = 0;
  protected readonly effects: (() => void)[] = [];
  protected identity!: IdentityCookie;
  protected anonymousIdProvider!: () => string | undefined;
  protected readonly adoptedProfileId = signal<string | undefined>();
  protected identityRevision = 0;
  protected destroyed = false;
  /**
   * Owner lifecycle token shared by async work, queues and detectors. Reset and
   * consent withdrawal replace it; destroy() makes it read `undefined`.
   */
  protected resetToken: object = {};
  protected previewMode!: boolean;

  /** Observable state shared with application subscriptions and internal effects. */
  readonly states: States = {
    flag: (name) => this.flagObservable(name),
    preview: toObservable(previewSignal, (value) => value),
    blockedEventStream: toObservable(blockedEventSignal),
    consent: toObservable(consentSignal),
    persistenceConsent: toObservable(persistenceConsentSignal),
    eventStream: toObservable(eventSignal, (event) => event),
    locale: toObservable(localeSignal),
    personalizationRequestState: toObservable(personalizationRequestStateSignal),
    profile: toObservable(profileSignal),
  };

  /** Transform emitted events and incoming state in registration order. */
  readonly interceptors: LifecycleInterceptors = {
    event: new InterceptorManager(),
    state: new InterceptorManager(),
  };

  get isPreview(): boolean {
    return this.previewMode;
  }

  override get locale(): string | undefined {
    return localeSignal.value;
  }
  protected get online(): boolean {
    return onlineSignal.value ?? false;
  }

  protected set online(isOnline: boolean) {
    onlineSignal.value = isOnline;
  }

  /** Changes the default locale used by subsequent events and fetches. */
  setLocale(locale: string | undefined): string | undefined {
    if (this.destroyed) return undefined;
    const resolvedLocale = normalizeExplicitLocale(locale);
    localeSignal.value = resolvedLocale;
    if (this.destroyed) return undefined;
    this.api.personalization.setLocale(resolvedLocale);
    return resolvedLocale;
  }
  protected initializeState(
    defaults: StatefulDefaults | undefined,
    locale: string | undefined,
    getAnonymousId: Config['getAnonymousId']
  ): void {
    this.anonymousIdProvider =
      getAnonymousId ??
      (() => (persistenceConsentSignal.value === true ? LocalStore.anonymousId : undefined));
    const { defaults: resolvedDefaults } = resolveStatefulDefaults(defaults, {
      consent: LocalStore.consent,
      persistenceConsent: LocalStore.persistenceConsent,
      profile: () => LocalStore.profile,
      changes: () => LocalStore.changes,
    });
    batch(() => {
      consentSignal.value = resolvedDefaults.consent;
      persistenceConsentSignal.value = resolvedDefaults.persistenceConsent;
      profileSignal.value = resolvedDefaults.profile;
      changesSignal.value = resolvedDefaults.changes;
      localeSignal.value = locale;
      onlineSignal.value = globalThis.navigator?.onLine !== false;
      eventSignal.value = undefined;
      blockedEventSignal.value = undefined;
      personalizationRequestStateSignal.value = { status: 'idle' };
      previewSignal.value = undefined;
    });
  }

  /**
   * Sets consent for this browser. `true` or `false` sets event and persistence
   * consent together; an object updates either independently. Decisions are stored
   * in LocalStorage, always, so they survive reloads. Denying persistence removes
   * the stored profile but keeps it in memory for the current session.
   */
  consent(input: ConsentInput): void {
    if (this.destroyed) return;
    const next = toConsentState(input);
    batch(() => {
      // A subscriber can destroy the SDK and dispose effects still waiting for the
      // batch to end. Persist explicit decisions before any such notification.
      if (next.events !== undefined) {
        consentSignal.value = next.events;
        LocalStore.consent = next.events;
      }
      if (next.persistence !== undefined) {
        persistenceConsentSignal.value = next.persistence;
        LocalStore.persistenceConsent = next.persistence;
      }
      if (next.events === false) this.withdrawEventConsent();
      try {
        if (next.persistence === false) {
          LocalStore.clearProfileContinuity();
          this.identity.clear();
        } else if (this.isPreview && next.persistence === true) {
          // Preview startup never mutates continuity. An explicit visitor command still can.
          this.reconcileCookie(this.identity.read());
          LocalStore.profile = profileSignal.peek();
          this.identity.persist(
            this.identity.resolve({
              profileId: profileSignal.peek()?.id,
              handoffId: this.adoptedProfileId.peek(),
            })
          );
        }
      } finally {
        // Cookie deletion can throw in a restricted document. Queues and old
        // measurements are already discarded; permitted detectors still restart.
        if (next.events === false) {
          this.syncTrackingConsent();
          this.retryActiveFlagViews();
        }
      }
    });
  }

  protected async adoptFetchedState(
    personalization: PortableRenderPlan['personalization'],
    isCurrent: () => boolean,
    canApplyProfile = !this.isPreview
  ): Promise<void> {
    if (!personalization || !isCurrent()) return;
    await this.applyOptimizationDataToSignals(
      {
        ...(canApplyProfile ? { profile: EventProfileSchema.parse(personalization.profile) } : {}),
        ...(personalization.changes !== undefined
          ? { changes: ChangeArray.parse(personalization.changes) }
          : {}),
      },
      isCurrent,
      () => canApplyProfile
    );
  }

  /**
   * Resolve request identity with Optimization's provider-first precedence, then the
   * active profile and an identity adopted from a server handoff.
   */
  protected requestIdentity(): string | undefined {
    return this.anonymousIdProvider() ?? profileSignal.value?.id ?? this.adoptedProfileId.value;
  }

  /**
   * Reconciles a captured cookie with the profile held. A cookie for a different visitor
   * than the profile held means that profile is not theirs, so it is reset before the
   * cookie's identity is written, which the cookie helper sequences.
   */
  protected reconcileCookie(snapshot: CookieSnapshot): void {
    this.identity.reconcile(snapshot, {
      currentProfileId: profileSignal.value?.id,
      reset: () => this.reset(),
    });
  }

  protected getConsent(): ConsentState {
    return { events: consentSignal.value, persistence: persistenceConsentSignal.value };
  }

  protected async applyOptimizationDataToSignals(
    data: PersonalizationState,
    isCurrent: () => boolean,
    canApplyProfile: () => boolean = () => true,
    canApplyChanges: () => boolean = () => true
  ): Promise<void> {
    if (this.destroyed) return;
    const stateRevision = this.stateRevision;
    const token = this.resetToken;
    const next = mergePersonalizationState(
      data,
      await this.interceptors.state.run(data, mergePersonalizationState)
    );
    if (!isCurrent() || !this.isCurrent(token)) return;
    batch(() => {
      if (this.stateRevision === stateRevision) {
        this.commitIncomingState(next, canApplyProfile(), canApplyChanges());
      }
      personalizationRequestStateSignal.value = { status: 'success' };
    });
  }

  private commitIncomingState(
    next: PersonalizationState,
    canApplyProfile = true,
    canApplyChanges = true
  ): void {
    if (canApplyProfile && Object.hasOwn(next, 'profile')) {
      if (profileSignal.peek()?.id !== next.profile?.id) {
        this.clearFlagViews();
        if (!Object.hasOwn(next, 'changes')) changesSignal.value = undefined;
      }
      if (!isEqual(profileSignal.value, next.profile)) profileSignal.value = next.profile;
      this.setAdoptedProfileId(undefined);
    }
    if (
      canApplyChanges &&
      Object.hasOwn(next, 'changes') &&
      !isEqual(changesSignal.value, next.changes)
    ) {
      changesSignal.value = next.changes;
    }
  }

  protected initializeEffects(): void {
    let previousProfile = profileSignal.peek();
    let previousChanges = changesSignal.peek();
    this.effects.push(
      effect(() => {
        const profile = profileSignal.value;
        const changes = changesSignal.value;
        if (profile !== previousProfile || changes !== previousChanges) {
          previousProfile = profile;
          previousChanges = changes;
          this.stateRevision += 1;
        }
      })
    );
    this.effects.push(
      effect(() => {
        const consent = consentSignal.value;
        // consent() persists explicit decisions before subscribers run. Construction
        // still persists defaults, and an undecided value clears any stored decision.
        if (consent === undefined || LocalStore.consent !== consent) LocalStore.consent = consent;
        untracked(() => this.syncTrackingConsent());
      })
    );
    this.effects.push(
      effect(() => {
        const persistenceConsent = persistenceConsentSignal.value;
        LocalStore.persistenceConsent = persistenceConsent;
        if (this.isPreview) return;
        if (persistenceConsent === true) {
          untracked(() => this.reconcileCookie(this.identity.read()));
        }
        if (persistenceConsent === false) {
          this.identity.clear();
          LocalStore.clearProfileContinuity();
        }
      })
    );
    this.effects.push(
      effect(() => {
        const profile = profileSignal.value;
        const changes = changesSignal.value;
        const persistenceConsent = persistenceConsentSignal.value;
        const handoffId = this.adoptedProfileId.value;
        if (this.isPreview || persistenceConsent !== true) return;
        LocalStore.profile = profile;
        LocalStore.changes = changes;
        this.identity.persist(this.identity.resolve({ profileId: profile?.id, handoffId }));
      })
    );
    this.effects.push(
      effect(() => {
        if (!onlineSignal.value) return;
        this.personalizationQueue.clearScheduledRetry();
        this.analyticsQueue.clearScheduledRetry();
        void this.flushQueues(
          { force: true },
          () => !this.destroyed && onlineSignal.peek() === true
        );
      })
    );
  }

  protected isCurrent(token: object): boolean {
    return !this.destroyed && this.resetToken === token;
  }

  protected disposeEffects(): void {
    for (const dispose of this.effects.splice(0)) dispose();
  }

  protected setAdoptedProfileId(profileId: string | undefined): void {
    if (this.adoptedProfileId.value === profileId) return;
    this.identityRevision += 1;
    this.adoptedProfileId.value = profileId;
  }
}
