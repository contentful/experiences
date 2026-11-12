// Shared server configuration; Pages GSSP removes this module from the client bundle.
import {
  bindNextjsAppRouterServerExperiences,
  type NextjsAppRouterServerExperiencesConfig,
} from '@contentful/experiences-nextjs/app-router/server';
import { bindNextjsPagesRouterServerExperiences } from '@contentful/experiences-nextjs/pages-router/server';
import type { NextjsCookieReader } from '@contentful/experiences-nextjs/server';
import { getServer } from './config';
import { experienceConfig } from './components/ExperienceContent';
import { AppExperiencesRoot } from './components/SingleExperience';
import { readConsent } from './server-reference';
import { primaryExperience } from './reference';

function configuration(): NextjsAppRouterServerExperiencesConfig {
  const { nodeConfig, config, browser } = getServer();
  return {
    ...nodeConfig,
    config: experienceConfig,
    browser: {
      delivery: browser.web.delivery,
      ...(browser.web.preview ? { preview: browser.web.preview } : {}),
    },
    consent: { server: ({ cookies }: { cookies: NextjsCookieReader }) => readConsent(cookies) },
    livePreview: {
      ...browser.livePreview,
      enabled: Boolean(browser.livePreview),
      loadImplementation: () => import('@contentful/experiences-live-preview'),
    },
    request: {
      experience: ({ requestUrl }) =>
        primaryExperience(browser, new URL(requestUrl), config.experienceIds[0]),
    },
  };
}

export function singleAppExperiences() {
  return bindNextjsAppRouterServerExperiences(configuration(), {
    request: {
      ExperiencesRoot: AppExperiencesRoot,
    },
  });
}

export function singlePagesExperiences() {
  return bindNextjsPagesRouterServerExperiences({
    ...configuration(),
    origin: getServer().config.origin,
  });
}
