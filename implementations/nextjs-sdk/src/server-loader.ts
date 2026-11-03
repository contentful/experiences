import 'server-only';

import {
  bindNextjsExperiencesRequest,
  createNextjsPageContext,
  type NextjsSearchParams,
  type PortableRenderPlan,
} from '@contentful/experiences-nextjs/server';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { getServer } from './config';
import { experienceConfig } from './components/ExperienceContent';

export interface ServerContent {
  experienceId: string;
  plan?: PortableRenderPlan;
  error?: Error;
}

// React cache shares this result within a server render for the same pathname
// and searchParams reference. Pass Next's request object unchanged.
export const loadServerPage = cache(async (pathname: string, searchParams: NextjsSearchParams) => {
  const { sdk, config } = getServer();
  const incomingHeaders = await headers();
  const page = createNextjsPageContext({
    path: pathname,
    origin: config.origin,
    referrer: incomingHeaders.get('referer') || '',
    searchParams,
  });
  const url = new URL(page.url);
  const incomingCookies = await cookies();
  const decision = (value: string | undefined) =>
    value === 'granted' ? true : value === 'denied' ? false : undefined;
  const sessionId = url.searchParams.get('preview_session_id')?.trim();
  const experienceId =
    url.searchParams.get('preview_experience_id')?.trim() || config.livePreview?.experienceId;
  const previewBinding =
    config.livePreview && sessionId && experienceId
      ? { ...config.livePreview, sessionId, experienceId }
      : undefined;
  const livePreview = previewBinding
    ? async () => ({
        ...previewBinding,
        implementation: await import('@contentful/experiences-live-preview'),
      })
    : undefined;
  const request = bindNextjsExperiencesRequest(sdk, {
    request: { url: page.url, headers: incomingHeaders },
    // The binding derives event context and gates cookie identity; page-event
    // properties below are separate, explicit initial intent.
    consent: {
      events: decision(incomingCookies.get('experiences-nextjs-event-consent')?.value),
      persistence: decision(incomingCookies.get('experiences-nextjs-persistence-consent')?.value),
    },
    cookies: incomingCookies,
    locale: config.locale,
    livePreview,
    isPreview: Boolean(previewBinding),
  });
  // Reference comparisons do not inherit the primary's provisional identity.
  const comparisons = sdk.forRequest({
    locale: request.locale,
    isPreview: request.isPreview,
    livePreview,
  });
  const displayIds =
    pathname === '/page-two' ? config.experienceIds.slice(-1) : config.experienceIds;
  const repeatedId = config.experienceIds[0];
  // The route's primary loads first with initial intent. Remaining reference
  // presentations load sequentially without events; repeated roots reuse plans.
  const fetchIds = [...new Set([...displayIds, repeatedId])];
  const contents: ServerContent[] = [];
  try {
    for (const [index, id] of fetchIds.entries()) {
      const content: ServerContent = { experienceId: id };
      try {
        content.plan = await (index === 0 ? request : comparisons).fetchExperience(
          {
            experienceId: id,
            extensions: previewBinding?.experienceId === id ? undefined : { sourceMap: {} },
            personalization:
              index === 0 && !request.isPreview
                ? {
                    events: [
                      ...(url.searchParams.get('userId') === 'charles'
                        ? [
                            {
                              type: 'identify' as const,
                              userId: 'charles',
                              traits: { identified: true },
                            },
                          ]
                        : []),
                      { type: 'page' as const, properties: page },
                    ],
                  }
                : undefined,
          },
          { config: experienceConfig }
        );
      } catch (error) {
        content.error =
          error instanceof Error ? error : new Error('Experience content is unavailable.');
      }
      contents.push(content);
    }
    return {
      contents: contents.filter((content) => displayIds.includes(content.experienceId)),
      repeated: contents.find((content) => content.experienceId === repeatedId),
    };
  } finally {
    // Server Components cannot mutate response cookies. No transfer or browser
    // initialization is produced by this ordinary server-only presentation.
    comparisons.destroy();
    request.destroy();
  }
});
