import type { Config } from '@contentful/experiences-web';
import type {
  NextjsBrowserConfig,
  NextjsRequestResult,
} from '@contentful/experiences-nextjs/app-router/client';

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

export type ContentSeed = NextjsRequestResult;

export function routeIds(pathname: string, ids: readonly string[]) {
  const display = pathname.endsWith('/page-two') ? ids.slice(-1) : [...ids];
  return [...new Set([...display, ids[0]])];
}

export const consentCookies = {
  events: 'experiences-nextjs-event-consent',
  persistence: 'experiences-nextjs-persistence-consent',
} as const;

export function consentDecision(value: string | undefined) {
  return value === 'granted' ? true : value === 'denied' ? false : undefined;
}

// Only deployment-enabled preview with an actual URL session selects preview policy.
export function previewBinding(environment: BrowserEnvironment, url: URL) {
  const sessionId = url.searchParams.get('preview_session_id')?.trim();
  return environment.livePreview && sessionId
    ? {
        ...environment.livePreview,
        experienceId:
          url.searchParams.get('preview_experience_id')?.trim() ||
          environment.livePreview.experienceId,
        sessionId,
      }
    : undefined;
}

export function primaryExperience(
  environment: BrowserEnvironment,
  url: URL,
  fallbackExperienceId: string
) {
  const preview = previewBinding(environment, url);
  return {
    experienceId: preview?.experienceId || fallbackExperienceId,
    ...(preview ? {} : { extensions: { sourceMap: {} } }),
  };
}

export function previewConfiguration(binding: ReturnType<typeof previewBinding>) {
  return binding
    ? {
        sessionId: binding.sessionId,
        sessionHost: binding.sessionHost,
        resourceResolution: binding.resourceResolution,
      }
    : undefined;
}
