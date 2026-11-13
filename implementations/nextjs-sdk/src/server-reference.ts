import {
  bindExperiencesRequest,
  createPageContext,
  serializePlan,
  type RequestRuntime,
  type CookieReader,
  type PortableRenderPlan,
} from '@contentful/experiences-nextjs/server';
import type { FetchExperienceOptions } from '@contentful/experiences-node';
import type { RequestResult } from '@contentful/experiences-nextjs/app-router/client';

import { getServer } from './config';
import {
  consentCookies,
  consentDecision,
  previewBinding,
  previewConfiguration,
  routeIds,
  type ContentSeed,
} from './reference';
import { experienceConfig } from './components/ExperienceContent';

export interface ServerContent {
  experienceId: string;
  plan?: PortableRenderPlan;
  error?: unknown;
}

export function contentSeeds(
  contents: readonly ServerContent[],
  result: RequestResult
): ContentSeed[] {
  return contents.map(({ experienceId, plan, error }) => {
    if (experienceId === result.experience.experienceId) return result;
    return {
      requestId: result.requestId,
      routeKey: result.routeKey,
      experience: { experienceId, personalization: { events: [] } },
      ...(plan ? { plan: serializePlan(plan) } : {}),
      ...(error ? { contentError: 'Experience content unavailable.' } : {}),
    };
  });
}
export function readConsent(cookies: CookieReader) {
  const value = (name: string) => {
    const cookie = cookies.get(name);
    return typeof cookie === 'string' ? cookie : cookie?.value;
  };
  return {
    events: consentDecision(value(consentCookies.events)),
    persistence: consentDecision(value(consentCookies.persistence)),
  };
}

export function serverPreview(url: URL) {
  const { browser } = getServer();
  return previewConfiguration(previewBinding(browser, url));
}

export function createContentRequest(
  url: URL,
  headers: Headers,
  cookies: CookieReader,
  profile?: RequestRuntime['profile']
) {
  const { sdk, config } = getServer();
  return bindExperiencesRequest(sdk, {
    request: { url: url.toString(), headers },
    cookies,
    profile,
    consent: readConsent(cookies),
    locale: config.locale,
    preflight: false,
    page: createPageContext({
      path: url.pathname,
      origin: config.origin,
      searchParams: url.searchParams,
      referrer: headers.get('referer') ?? '',
    }),
  });
}

export async function loadReferenceContent(
  request: RequestRuntime,
  url: URL,
  personalization?: FetchExperienceOptions['personalization']
) {
  const experienceId = routeIds(url.pathname, getServer().config.experienceIds)[0];
  const plan = await request.fetchExperience(
    {
      experienceId,
      ...(request.isPreview ? {} : { extensions: { sourceMap: {} }, personalization }),
    },
    { config: experienceConfig }
  );
  const primary = { experienceId, plan };
  return [primary, ...(await loadComparisons(request, primary, url, false))];
}

// Comparisons have no visitor intent. Keep primary preflight identity on its own
// request: a newly returned ID may not exist for a later profile-only lookup.
export async function loadComparisons(
  request: RequestRuntime,
  primary: ServerContent,
  url: URL,
  preflight: boolean
) {
  const { sdk, browser } = getServer();
  const comparisons = sdk.forRequest({
    locale: request.locale,
    preflight,
    preview: request.isPreview ? serverPreview(url) : undefined,
  });
  const output: ServerContent[] = [];
  try {
    for (const experienceId of routeIds(url.pathname, browser.experienceIds)) {
      if (experienceId === primary.experienceId) continue;
      try {
        output.push({
          experienceId,
          plan: await comparisons.fetchExperience(
            { experienceId, ...(request.isPreview ? {} : { extensions: { sourceMap: {} } }) },
            { config: experienceConfig }
          ),
        });
      } catch (error) {
        output.push({ experienceId, error });
      }
    }
    return output;
  } finally {
    comparisons.destroy();
  }
}
