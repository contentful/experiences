import type { Config as BaseConfig } from '@contentful/experiences-runtime';
import { getPageProperties, getUserAgent } from '../browser/event-context.js';
import { DEFAULT_EVENT_CONTEXT_LIBRARY } from '../sdk-info.js';
import type { Config } from './types.js';

export function createRuntimeConfig(
  config: Config,
  locale: string | undefined
): Config & Pick<BaseConfig, 'eventBuilder'> {
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
