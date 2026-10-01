import {
  ANONYMOUS_ID_KEY,
  ContentfulExperiences as ClientContentfulExperiences,
  type ContentfulExperiencesConfig,
  type EventBuilderConfig,
  type EventProfile,
  parseRuntimeEventHandoff,
  type RuntimeEventHandoff,
  type RuntimeEventHandoffReceipt,
  type RuntimeEventMethods,
  type RuntimeFetchExperienceOptions,
  type RuntimeResolveOptions,
} from '@contentful/experiences-client';
import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';

import { getPageProperties, getUserAgent } from './browser-event-context.js';
import { DEFAULT_EVENT_CONTEXT_LIBRARY } from './sdk-info.js';

/** Optional browser context providers, useful for application-specific redaction. */
export type BrowserEventContextProviders = Pick<
  EventBuilderConfig,
  'getPageProperties' | 'getUserAgent' | 'getConsent'
>;

/**
 * Long-lived, browser-oriented SDK configuration.
 */
type WebEventStateConfig =
  | {
      /** Initial browser event profile. Mutually exclusive with eventHandoff. */
      profile?: EventProfile;
      eventHandoff?: never;
      eventHandoffRouteKey?: never;
    }
  | {
      profile?: never;
      /** Validated server journal that this browser runtime commits at most once. */
      eventHandoff: RuntimeEventHandoff;
      /** Current browser route identity used to admit a page-bearing handoff. */
      eventHandoffRouteKey: string;
    };

export type ExperiencesWebConfig = Omit<ContentfulExperiencesConfig, 'eventBuilder' | 'locale'> &
  WebEventStateConfig & {
    locale?: string;
    app?: EventBuilderConfig['app'];
    browserContext?: BrowserEventContextProviders;
  };

type WebEventMethods = Pick<
  RuntimeEventMethods,
  'identify' | 'page' | 'track' | 'trackView' | 'trackClick' | 'trackHover' | 'trackFlagView'
>;

/** Browser runtime with mutable application locale and live event context. */
export class ContentfulExperiences extends ClientContentfulExperiences {
  #locale: string | undefined;
  #profile: EventProfile | undefined;
  #profileRevision = 0;
  #eventHandoffPending = false;
  readonly #eventHandoffPromise: Promise<RuntimeEventHandoffReceipt>;
  readonly #eventMethods: RuntimeEventMethods;
  readonly identify: WebEventMethods['identify'] = (...args) =>
    this.#afterEventHandoff(() => this.#eventMethods.identify(...args));
  readonly page: WebEventMethods['page'] = (...args) =>
    this.#afterEventHandoff(() => this.#eventMethods.page(...args));
  readonly track: WebEventMethods['track'] = (...args) =>
    this.#afterEventHandoff(() => this.#eventMethods.track(...args));
  readonly trackView: WebEventMethods['trackView'] = (...args) =>
    this.#afterEventHandoff(() => this.#eventMethods.trackView(...args));
  readonly trackClick: WebEventMethods['trackClick'] = (...args) =>
    this.#afterEventHandoff(() => this.#eventMethods.trackClick(...args));
  readonly trackHover: WebEventMethods['trackHover'] = (...args) =>
    this.#afterEventHandoff(() => this.#eventMethods.trackHover(...args));
  readonly trackFlagView: WebEventMethods['trackFlagView'] = (...args) =>
    this.#afterEventHandoff(() => this.#eventMethods.trackFlagView(...args));

  constructor(config: ExperiencesWebConfig) {
    const { app, browserContext, profile, eventHandoff, eventHandoffRouteKey, ...clientConfig } =
      config;
    super({
      ...clientConfig,
      eventBuilder: {
        app,
        channel: 'web',
        library: DEFAULT_EVENT_CONTEXT_LIBRARY,
        getPageProperties: browserContext?.getPageProperties ?? getPageProperties,
        getUserAgent: browserContext?.getUserAgent ?? getUserAgent,
        getConsent: browserContext?.getConsent,
      },
    });
    if (profile !== undefined && eventHandoff !== undefined) {
      throw new TypeError('ExperiencesWebConfig accepts either profile or eventHandoff, not both');
    }
    this.#locale = clientConfig.locale;
    this.#setProfile(profile ?? readStoredProfile());
    this.#eventMethods = this.createEventMethods({
      getProfile: () => this.#profile,
      setProfile: (nextProfile) => {
        this.#setProfile(nextProfile);
      },
      getProfileRevision: () => this.#profileRevision,
    });
    this.#eventHandoffPromise = this.#startEventHandoff(eventHandoff, eventHandoffRouteKey);
    // Replay is eager. Mark a rejection as observed even when an application has
    // not attached its barrier handler yet; callers still receive the original
    // rejected promise from whenEventHandoffCommitted().
    void this.#eventHandoffPromise.catch(() => undefined);
  }

  override get locale(): string | undefined {
    return this.#locale;
  }

  get profile(): EventProfile | undefined {
    return this.#profile;
  }

  /**
   * Resolves after the optional server handoff commits or is skipped for route
   * incompatibility. A transport failure rejects without blocking later calls.
   */
  whenEventHandoffCommitted(): Promise<RuntimeEventHandoffReceipt> {
    return this.#eventHandoffPromise;
  }

  /** Changes the default locale used by subsequent events and fetches. */
  setLocale(locale: string | undefined): void {
    this.#locale = locale;
  }

  override async fetchExperience(
    options: RuntimeFetchExperienceOptions,
    resolveOptions?: RuntimeResolveOptions
  ): Promise<PortableRenderPlan> {
    const profileRevision = this.#profileRevision;
    const profileId = options.personalization?.profileId ?? this.#profile?.id;
    const plan = await super.fetchExperience(
      profileId === undefined
        ? options
        : {
            ...options,
            personalization: { ...options.personalization, profileId },
          },
      resolveOptions
    );
    const returnedProfileId = plan.personalization?.profileId;
    if (returnedProfileId !== undefined && this.#profileRevision === profileRevision) {
      this.#setProfile(
        this.#profile?.id === returnedProfileId ? this.#profile : { id: returnedProfileId }
      );
    }
    return plan;
  }

  /** Clears browser profile state and its persisted id. */
  reset(): void {
    if (this.#eventHandoffPending) {
      throw new Error('Cannot reset while an event handoff is pending');
    }
    this.#setProfile(undefined);
    this.#profileRevision += 1;
  }

  #afterEventHandoff<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.#eventHandoffPending) return operation();
    return this.#eventHandoffPromise.then(operation, operation);
  }

  #startEventHandoff(
    input: RuntimeEventHandoff | undefined,
    currentRouteKey: string | undefined
  ): Promise<RuntimeEventHandoffReceipt> {
    if (input === undefined) {
      return Promise.resolve({});
    }
    if (currentRouteKey === undefined) {
      throw new TypeError('ExperiencesWebConfig eventHandoff requires eventHandoffRouteKey');
    }

    const handoff = parseRuntimeEventHandoff(input);
    if (handoff.spaceId !== this.spaceId || handoff.environmentId !== this.environmentId) {
      throw new TypeError('Runtime event handoff does not match this space or environment');
    }

    const hasPage = handoff.events.some(
      (entry) => entry.transport === 'personalization' && entry.event.type === 'page'
    );
    if (
      hasPage &&
      (handoff.initialPageRouteKey === undefined || handoff.initialPageRouteKey !== currentRouteKey)
    ) {
      return Promise.resolve({});
    }

    this.#eventHandoffPending = true;
    return this.#replayEventHandoff(handoff);
  }

  async #replayEventHandoff(handoff: RuntimeEventHandoff): Promise<RuntimeEventHandoffReceipt> {
    try {
      let profile: EventProfile | undefined =
        handoff.initialProfileId === undefined ? undefined : { id: handoff.initialProfileId };
      this.#setProfile(profile);
      for (let index = 0; index < handoff.events.length;) {
        const staged = handoff.events[index]!;
        if (staged.transport === 'personalization') {
          const locale = staged.event.context.locale;
          const events = [staged.event];
          index += 1;
          while (index < handoff.events.length) {
            const next = handoff.events[index]!;
            if (next.transport !== 'personalization' || next.event.context.locale !== locale) break;
            events.push(next.event);
            index += 1;
          }
          const result = await this.optimizationApi.personalization.upsertProfile(
            { profileId: profile?.id, events },
            { locale }
          );
          profile = result.profile;
          this.#setProfile(profile);
        } else {
          index += 1;
          if (profile === undefined) {
            throw new Error('Runtime event handoff Analytics replay requires a committed profile');
          }
          const committed = await this.optimizationApi.analytics.sendBatchEvents([
            { profile, events: [staged.event] },
          ]);
          if (!committed) {
            throw new Error('Runtime event handoff Analytics replay was not committed');
          }
        }
      }

      return {
        ...(handoff.initialPageRouteKey === undefined
          ? {}
          : { initialPageRouteKey: handoff.initialPageRouteKey }),
      };
    } finally {
      this.#eventHandoffPending = false;
    }
  }

  #setProfile(profile: EventProfile | undefined): void {
    this.#profile = profile;
    writeStoredProfileId(profile?.id);
  }
}

function readStoredProfile(): EventProfile | undefined {
  try {
    if (typeof window === 'undefined') return undefined;
    const id = window.localStorage.getItem(ANONYMOUS_ID_KEY);
    return id ? { id } : undefined;
  } catch {
    return undefined;
  }
}

function writeStoredProfileId(id: string | undefined): void {
  try {
    if (typeof window === 'undefined') return;
    if (id === undefined) window.localStorage.removeItem(ANONYMOUS_ID_KEY);
    else window.localStorage.setItem(ANONYMOUS_ID_KEY, id);
  } catch {
    // LocalStorage is best-effort and may be unavailable in restricted browsers.
  }
}
