import { normalizeExplicitLocale } from '../browser/locale.js';
import {
  IdentityCookie,
  type IdentityCookieOptions,
  type CookieSnapshot,
} from '../browser/identity-cookie.js';
import LocalStore from '../storage/local-store.js';
import { resolveStatefulDefaults } from '../browser/stateful-defaults.js';
import type { ConfigDefaults } from './types.js';
import { installCoreBridgeCapabilities } from '../bridge-support/capabilities.js';
import {
  effect,
  toObservable,
  consent as consentSignal,
  persistenceConsent as persistenceConsentSignal,
  locale as localeSignal,
  online as onlineSignal,
  event as eventSignal,
  blockedEvent as blockedEventSignal,
} from '../signals/index.js';
import { untracked } from '@preact/signals-core';
import {
  ContentfulExperiences as RuntimeContentfulExperiences,
  ChangeArray,
  EventProfileSchema,
  type Config as RuntimeConfig,
  type EventMethods,
  type Json,
  type BlockedEvent,
} from '@contentful/experiences-runtime';
import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';
import { signal } from '@preact/signals-core';
import { isEqual } from 'es-toolkit/predicate';
import {
  batch,
  changes as changesSignal,
  profile as profileSignal,
  personalizationRequestState as personalizationRequestStateSignal,
} from '../signals/index.js';
import type { PreviewState, States } from '../state/states.js';
import {
  mergePersonalizationState,
  createLifecycleInterceptors,
  type PersonalizationState,
  type LifecycleInterceptors,
} from '../state/interceptors.js';
import { FlagExposure } from '../flags/flag-exposure.js';

/** Stateful mechanics share the final SDK receiver; construction only allocates state. */
export abstract class WebStateRuntime<
  TConfig extends RuntimeConfig,
> extends RuntimeContentfulExperiences<TConfig> {
  protected contentLifetime = 0;
  protected profileRevision = 0;
  protected stateRevision = 0;
  protected readonly adoptedProfileId = signal<string | undefined>();
  protected identityRevision = 0;
  protected resetToken: object = {};
  protected destroyed = false;
  protected readonly effects: (() => void)[] = [];
  protected readonly previewState = signal<PreviewState | undefined>();
  protected getAnonymousIdProvider!: () => string | undefined;
  protected readonly flags = new FlagExposure(
    this,
    () => (this.destroyed ? undefined : this.resetToken),
    (event) => this.reportBlockedEvent(event)
  );
  readonly states: States = {
    flag: (name) => this.flags.observable(name),
    preview: toObservable(this.previewState, (value) => value),
    blockedEventStream: toObservable(blockedEventSignal),
    consent: toObservable(consentSignal),
    persistenceConsent: toObservable(persistenceConsentSignal),
    eventStream: toObservable(eventSignal, (event) => event),
    locale: toObservable(localeSignal),
    personalizationRequestState: toObservable(personalizationRequestStateSignal),
    profile: toObservable(profileSignal),
  };
  readonly interceptors: LifecycleInterceptors = createLifecycleInterceptors();
  abstract get isPreview(): boolean;
  abstract hasConsent(name: string): boolean;
  abstract readonly trackFlagView: EventMethods['trackFlagView'];
  protected abstract reportBlockedEvent(event: BlockedEvent): void;

  override getFlag(
    name: string,
    changes: readonly unknown[] | undefined = changesSignal.value
  ): Json | undefined {
    return this.flags.read(name, changes);
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

  protected commitIncomingState(
    next: PersonalizationState,
    canApplyProfile = true,
    canApplyChanges = true
  ): void {
    if (canApplyProfile && Object.hasOwn(next, 'profile')) {
      if (profileSignal.peek()?.id !== next.profile?.id) {
        this.flags.clearAttempts();
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

  protected setAdoptedProfileId(profileId: string | undefined): void {
    if (this.adoptedProfileId.value === profileId) return;
    this.identityRevision += 1;
    this.adoptedProfileId.value = profileId;
  }

  /**
   * Resolve request identity with Optimization's provider-first precedence, then the
   * active profile and an identity adopted from a server handoff.
   */
  protected requestIdentity(): string | undefined {
    return this.getAnonymousIdProvider() ?? profileSignal.value?.id ?? this.adoptedProfileId.value;
  }

  protected isCurrent(token: object): boolean {
    return !this.destroyed && this.resetToken === token;
  }
  protected identity!: IdentityCookie;
  abstract reset(): void;
  protected abstract syncInteractionConsent(): void;

  protected initializeIdentity(cookie: IdentityCookieOptions | undefined): void {
    this.identity = new IdentityCookie(LocalStore, cookie);
  }

  protected initializeBrowserState(
    defaults: ConfigDefaults | undefined,
    locale: string | undefined
  ): void {
    const { defaults: resolvedDefaults } = resolveStatefulDefaults(defaults, {
      consent: LocalStore.consent,
      persistenceConsent: LocalStore.persistenceConsent,
      profile: () => (this.isPreview ? undefined : LocalStore.profile),
      changes: () => (this.isPreview ? undefined : LocalStore.changes),
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
    });
  }

  protected captureIncomingCookie(
    defaults: ConfigDefaults | undefined
  ): CookieSnapshot | undefined {
    if (this.isPreview && (defaults?.persistenceConsent ?? defaults?.consent) === false) {
      LocalStore.clearProfileContinuity();
      this.identity.clear();
    }
    return !this.isPreview && persistenceConsentSignal.value === true
      ? this.identity.read()
      : undefined;
  }

  protected installCoreBridge(): void {
    installCoreBridgeCapabilities(this, (data) => {
      const token = this.resetToken;
      return this.applyOptimizationDataToSignals(data, () => this.isCurrent(token));
    });
  }

  protected installStateRevisionEffect(): () => void {
    let previousProfile = profileSignal.peek();
    let previousChanges = changesSignal.peek();
    return effect(() => {
      const profile = profileSignal.value;
      const changes = changesSignal.value;
      if (profile !== previousProfile) this.profileRevision += 1;
      if (profile !== previousProfile || changes !== previousChanges) {
        previousProfile = profile;
        previousChanges = changes;
        this.stateRevision += 1;
      }
    });
  }

  protected installConsentEffect(): () => void {
    return effect(() => {
      const consent = consentSignal.value;
      if (consent === undefined || LocalStore.consent !== consent) LocalStore.consent = consent;
      untracked(() => this.syncInteractionConsent());
    });
  }

  protected installPersistenceConsentEffect(): () => void {
    return effect(() => {
      const persistenceConsent = persistenceConsentSignal.value;
      LocalStore.persistenceConsent = persistenceConsent;
      if (this.isPreview) return;
      if (persistenceConsent === true) untracked(() => this.reconcileCookie(this.identity.read()));
      if (persistenceConsent === false) {
        this.identity.clear();
        LocalStore.clearProfileContinuity();
      }
    });
  }

  protected installProfilePersistenceEffect(): () => void {
    return effect(() => {
      const profile = profileSignal.value;
      const changes = changesSignal.value;
      const persistenceConsent = persistenceConsentSignal.value;
      const handoffId = this.adoptedProfileId.value;
      if (this.isPreview || persistenceConsent !== true) return;
      LocalStore.profile = profile;
      LocalStore.changes = changes;
      this.identity.persist(this.identity.resolve({ profileId: profile?.id, handoffId }));
    });
  }

  protected clearProfilePersistence(): void {
    LocalStore.clearProfileContinuity();
    this.identity.clear();
  }

  protected resetVisitorState(): void {
    this.stateRevision += 1;
    LocalStore.reset();
    this.identity.clear();
    profileSignal.value = undefined;
    changesSignal.value = undefined;
    eventSignal.value = undefined;
    blockedEventSignal.value = undefined;
    personalizationRequestStateSignal.value = { status: 'idle' };
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

  override get locale(): string | undefined {
    return localeSignal.value;
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
}
