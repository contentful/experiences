import 'server-only';

import { cache, createElement } from 'react';
import {
  bindNextjsAppRouterServerExperiences,
  serializeNextjsRequestResult,
} from '@contentful/experiences-nextjs/app-router/server';
import { getServer } from './config';
import { routeIds } from './reference';
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
  let comparisons: ServerContent[] = [];
  const binding = bindNextjsAppRouterServerExperiences(
    {
      ...nodeConfig,
      config: experienceConfig,
      consent: { server: ({ cookies }) => readConsent(cookies) },
      livePreview: ({ request }) => serverPreview(new URL(request.url)),
      request: {
        experience: ({ requestUrl }) => {
          const url = new URL(requestUrl);
          return {
            experienceId: routeIds(url.pathname, browser.experienceIds)[0],
            ...(serverPreview(url) ? {} : { extensions: { sourceMap: {} } }),
          };
        },
        hydration: ({ requestUrl }) =>
          new URL(requestUrl).searchParams.get('mode') === 'server-only'
            ? 'server-only'
            : 'preserve-server',
        initialEvents: ({ requestUrl }) =>
          new URL(requestUrl).searchParams.get('userId') === 'charles'
            ? [{ type: 'identify', userId: 'charles', traits: { identified: true } }]
            : [],
        composeRequest: async (request, primary, { requestUrl }) => {
          comparisons = await loadComparisons(request, primary, new URL(requestUrl));
        },
      },
    },
    {
      request: {
        ExperiencesRoot: (props) =>
          createElement(AppBrowserRoot, { ...props, environment: browser }),
      },
    }
  );
  const result = await binding.request.loadExperience();
  return {
    result,
    browserResult: serializeNextjsRequestResult(result),
    ExperiencesRoot: binding.request.ExperiencesRoot,
    comparisons,
    serverOnly: result.hydration === 'server-only',
    analytics:
      new URL(result.routeKey, 'https://nextjs.invalid').searchParams.get('analytics') !== 'off',
    browser,
  };
});
