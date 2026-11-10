import type { ContentfulExperiencesConfig } from '@contentful/experiences-runtime';
import { getPageProperties, getUserAgent } from '../browser/browser-event-context.js';
import { DEFAULT_EVENT_CONTEXT_LIBRARY } from '../sdk-info.js';
import type { ExperiencesWebConfig } from './types.js';

export function browserRuntimeConfig(
  config: ExperiencesWebConfig,
  locale: string | undefined
): ExperiencesWebConfig & Pick<ContentfulExperiencesConfig, 'eventBuilder'> {
  return {
    ...config,
    locale,
    eventBuilder: {
      app: config.app,
      channel: 'web',
      library: DEFAULT_EVENT_CONTEXT_LIBRARY,
      getPageProperties: config.browserContext?.getPageProperties ?? getPageProperties,
      getUserAgent: config.browserContext?.getUserAgent ?? getUserAgent,
    },
  };
}
