import {
  ContentfulExperiences as ClientContentfulExperiences,
  type ContentfulExperiencesConfig,
  type EventBuilderConfig,
} from '@contentful/experiences-client';

import { getPageProperties, getUserAgent } from './browser-event-context.js';
import { DEFAULT_EVENT_CONTEXT_LIBRARY } from './sdk-info.js';

/** Optional browser context providers, useful for application-specific redaction. */
export type BrowserEventContextProviders = Pick<
  EventBuilderConfig,
  'getPageProperties' | 'getUserAgent'
>;

/**
 * Long-lived, browser-oriented SDK configuration.
 */
export type ExperiencesWebConfig = Omit<ContentfulExperiencesConfig, 'eventBuilder' | 'locale'> & {
  locale?: string;
  app?: EventBuilderConfig['app'];
  browserContext?: BrowserEventContextProviders;
};

/** Browser runtime with mutable application locale and live event context. */
export class ContentfulExperiences extends ClientContentfulExperiences {
  #locale: string | undefined;

  constructor(config: ExperiencesWebConfig) {
    const { app, browserContext, ...clientConfig } = config;
    super({
      ...clientConfig,
      eventBuilder: {
        app,
        channel: 'web',
        library: DEFAULT_EVENT_CONTEXT_LIBRARY,
        getPageProperties: browserContext?.getPageProperties ?? getPageProperties,
        getUserAgent: browserContext?.getUserAgent ?? getUserAgent,
      },
    });
    this.#locale = config.locale;
  }

  override get locale(): string | undefined {
    return this.#locale;
  }

  /** Changes the default locale used by subsequent events and fetches. */
  setLocale(locale: string | undefined): void {
    this.#locale = locale;
  }
}
