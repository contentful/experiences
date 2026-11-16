import 'server-only';

import { cache, createElement } from 'react';
import { randomUUID } from 'node:crypto';
import { headers } from 'next/headers';
import {
  bindNextjsAppRouterServerExperiences,
  serializeNextjsRequestResult,
  type NextjsAppRouterExperienceResult,
} from '@contentful/experiences-nextjs/app-router/server';
import type { BoundNextjsRequestRootProps } from '@contentful/experiences-nextjs/app-router/client';
import {
  createNextjsRouteKey,
  NEXTJS_EXPERIENCES_REQUEST_URL_HEADER,
} from '@contentful/experiences-nextjs/server';
import { getServer } from './config';
import { primaryExperience, routeIds } from './reference';
import { experienceConfig } from './components/ExperienceContent';
import { AppBrowserRoot } from './components/BrowserRoot';
import {
  readConsent,
  serverPreview,
  loadComparisons,
  type ServerContent,
} from './server-reference';

export { contentSeeds } from './server-reference';

// The SDK owns the request; comparison presentation stays in the reference.
export const loadServerPage = cache(async () => {
  const { browser, nodeConfig } = getServer();
  const incoming = await headers();
  const forwarded = incoming.get(NEXTJS_EXPERIENCES_REQUEST_URL_HEADER);
  if (!forwarded) throw new Error('Configure the Experiences middleware before loading this page.');
  const url = new URL(forwarded);
  const serverOnly = url.searchParams.get('mode') === 'server-only';
  const experience = primaryExperience(
    browser,
    url,
    routeIds(url.pathname, browser.experienceIds)[0]
  );
  let comparisons: ServerContent[] = [];
  const binding = bindNextjsAppRouterServerExperiences({
    ...nodeConfig,
    config: experienceConfig,
    browser: {
      delivery: browser.web.delivery,
      ...(browser.web.preview ? { preview: browser.web.preview } : {}),
    },
    consent: { server: ({ cookies }) => readConsent(cookies) },
    preview: {
      ...nodeConfig.preview,
      sessionHost: browser.livePreview?.sessionHost,
      resourceResolution: browser.livePreview?.resourceResolution,
      enabled: Boolean(browser.livePreview),
    },
    request: {
      experience: ({ requestUrl }) => {
        const url = new URL(requestUrl);
        return primaryExperience(browser, url, routeIds(url.pathname, browser.experienceIds)[0]);
      },
      initialEvents: ({ requestUrl, headers }) =>
        headers.get('rsc') !== '1' && new URL(requestUrl).searchParams.get('userId') === 'charles'
          ? [{ type: 'identify', userId: 'charles', traits: { identified: true } }]
          : [],
      composeRequest: async (request, primary, { requestUrl }) => {
        comparisons = await loadComparisons(request, primary, new URL(requestUrl));
      },
    },
  });
  // The diagnostic hybrid view owns navigation in Web; this choice belongs to the host.
  const result: NextjsAppRouterExperienceResult =
    incoming.get('rsc') === '1' && !serverOnly && !serverPreview(url)
      ? {
          requestId: randomUUID(),
          routeKey: createNextjsRouteKey(url),
          experienceId: experience.experienceId,
          experience,
        }
      : await binding.request.loadExperience();
  const serialized = serializeNextjsRequestResult(result);
  const browserResult = { ...serialized };
  if (serverOnly) delete browserResult.plan;
  return {
    result,
    browserResult,
    ExperiencesRoot: (props: BoundNextjsRequestRootProps) =>
      createElement(AppBrowserRoot, { ...props, result: browserResult, environment: browser }),
    comparisons,
    serverOnly,
    analytics:
      new URL(result.routeKey, 'https://nextjs.invalid').searchParams.get('analytics') !== 'off',
    browser,
  };
});
