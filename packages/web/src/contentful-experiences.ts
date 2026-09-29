import {
  ContentfulExperiences as ClientContentfulExperiences,
  type ContentfulExperiencesConfig,
  type EventBuilderConfig,
  type EventProfile,
  parseRuntimeEventHandoff,
  type RuntimeEventHandoff,
  type RuntimeEventHandoffReceipt,
  type RuntimeEventMethods,
} from '@contentful/experiences-client';

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
      /** Volatile browser event profile. Mutually exclusive with eventHandoff. */
      profile?: EventProfile;
      eventHandoff?: never;
    }
  | {
      profile?: never;
      /** Validated server journal that this browser runtime commits eagerly once. */
      eventHandoff?: RuntimeEventHandoff;
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
  #eventHandoffSucceeded = true;
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
    const { app, browserContext, profile, eventHandoff, ...clientConfig } = config;
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
    this.#profile = profile;
    this.#eventMethods = this.createEventMethods({
      getProfile: () => this.#profile,
      setProfile: (nextProfile) => {
        this.#profile = nextProfile;
      },
      getProfileRevision: () => this.#profileRevision,
    });
    this.#eventHandoffPromise = this.#startEventHandoff(eventHandoff);
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
   * Resolves after the complete optional server handoff has committed. Adapters
   * use the successful receipt to decide whether to suppress their initial page.
   */
  whenEventHandoffCommitted(): Promise<RuntimeEventHandoffReceipt> {
    return this.#eventHandoffPromise;
  }

  /** Changes the default locale used by subsequent events and fetches. */
  setLocale(locale: string | undefined): void {
    this.#locale = locale;
  }

  /** Clears volatile event state when the active browser profile changes. */
  reset(): void {
    if (this.#eventHandoffPending) {
      throw new Error('Cannot reset while an event handoff is pending');
    }
    this.#profile = undefined;
    this.#profileRevision += 1;
  }

  #afterEventHandoff<T>(operation: () => Promise<T>): Promise<T> {
    if (this.#eventHandoffSucceeded) {
      return operation();
    }
    return this.#eventHandoffPromise.then(() => operation());
  }

  #startEventHandoff(input: RuntimeEventHandoff | undefined): Promise<RuntimeEventHandoffReceipt> {
    if (input === undefined) {
      return Promise.resolve({});
    }

    const handoff = parseRuntimeEventHandoff(input);
    if (handoff.spaceId !== this.spaceId || handoff.environmentId !== this.environmentId) {
      throw new TypeError('Runtime event handoff does not match this space or environment');
    }

    this.#eventHandoffPending = true;
    this.#eventHandoffSucceeded = false;
    return this.#replayEventHandoff(handoff);
  }

  async #replayEventHandoff(handoff: RuntimeEventHandoff): Promise<RuntimeEventHandoffReceipt> {
    try {
      let profile: EventProfile | undefined =
        handoff.initialProfileId === undefined ? undefined : { id: handoff.initialProfileId };
      this.#profile = profile;
      for (const staged of handoff.events) {
        if (staged.transport === 'experience') {
          const result = await this.optimizationApi.experience.upsertProfile(
            { profileId: profile?.id, events: [staged.event] },
            { locale: staged.event.context.locale }
          );
          profile = result.profile;
          this.#profile = profile;
        } else {
          if (profile === undefined) {
            throw new Error('Runtime event handoff Insights replay requires a committed profile');
          }
          const committed = await this.optimizationApi.insights.sendBatchEvents([
            { profile, events: [staged.event] },
          ]);
          if (!committed) {
            throw new Error('Runtime event handoff Insights replay was not committed');
          }
        }
      }

      this.#eventHandoffSucceeded = true;
      return {
        ...(handoff.initialPageRouteKey === undefined
          ? {}
          : { initialPageRouteKey: handoff.initialPageRouteKey }),
      };
    } finally {
      this.#eventHandoffPending = false;
    }
  }
}
