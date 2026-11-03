import {
  bindNextjsExperiencesRequest,
  createNextjsPageContext,
  serializeNextjsPlan,
  type RequestRuntime,
  type NextjsCookieReader,
  type PortableRenderPlan,
} from '@contentful/experiences-nextjs/server';
import type { FetchExperienceOptions } from '@contentful/experiences-node';
import type { NextjsRequestResult } from '@contentful/experiences-nextjs/app-router/client';

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
  result: NextjsRequestResult
): ContentSeed[] {
  return contents.map(({ experienceId, plan, error }) => {
    if (experienceId === result.experience.experienceId) return result;
    return {
      requestId: result.requestId,
      routeKey: result.routeKey,
      experience: { experienceId, personalization: { events: [] } },
      ...(plan ? { plan: serializeNextjsPlan(plan) } : {}),
      ...(error ? { contentError: 'Experience content unavailable.' } : {}),
    };
  });
}
export function readConsent(cookies: NextjsCookieReader) {
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
  cookies: NextjsCookieReader,
  profile?: RequestRuntime['profile']
) {
  const { sdk, config } = getServer();
  const livePreview = serverPreview(url);
  return bindNextjsExperiencesRequest(sdk, {
    request: { url: url.toString(), headers },
    cookies,
    profile,
    consent: readConsent(cookies),
    locale: config.locale,
    livePreview,
    isPreview: Boolean(livePreview),
    page: createNextjsPageContext({
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
  return [primary, ...(await loadComparisons(request, primary, url))];
}

// Comparisons have no visitor intent. Keep primary preflight identity on its own
// request: a newly returned ID may not exist for a later profile-only lookup.
export async function loadComparisons(
  request: RequestRuntime,
  primary: ServerContent,
  url: URL
) {
  const { sdk, browser } = getServer();
  const comparisons = sdk.forRequest({
    locale: request.locale,
    isPreview: request.isPreview,
    livePreview: request.isPreview ? serverPreview(url) : undefined,
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
