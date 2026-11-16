import type { Config } from '@contentful/experiences-web';
import type { NextjsBrowserConfig } from '@contentful/experiences-nextjs/app-router/client';

export interface BrowserEnvironment {
  readonly web: Pick<Config, 'spaceId' | 'environmentId' | 'locale'> &
    Pick<NextjsBrowserConfig, 'delivery' | 'preview'>;
  readonly experienceIds: string[];
  readonly livePreview?: {
    readonly experienceId: string;
    readonly sessionHost?: string;
    readonly resourceResolution?: string;
  };
}

export const consentCookies = {
  events: 'experiences-nextjs-event-consent',
  persistence: 'experiences-nextjs-persistence-consent',
} as const;

export function consentDecision(value: string | undefined) {
  return value === 'granted' ? true : value === 'denied' ? false : undefined;
}
