// Shared server configuration; Pages GSSP removes this module from the client bundle.
import {
  bindAppRouterServerExperiences,
  type AppRouterServerConfig,
} from '@contentful/experiences-nextjs/app-router/server';
import { bindPagesRouterServerExperiences } from '@contentful/experiences-nextjs/pages-router/server';
import type { CookieReader } from '@contentful/experiences-nextjs/server';
import { getServer } from './config';
import { experienceConfig } from './components/ExperienceContent';
import { AppExperiencesRoot } from './components/SingleExperience';
import { readConsent } from './server-reference';
import { primaryExperience } from './reference';

function configuration(): AppRouterServerConfig {
  const { nodeConfig, config, browser } = getServer();
  return {
    ...nodeConfig,
    config: experienceConfig,
    browser: {
      delivery: browser.web.delivery,
      ...(browser.web.preview ? { preview: browser.web.preview } : {}),
    },
    consent: { server: ({ cookies }: { cookies: CookieReader }) => readConsent(cookies) },
    preview: {
      ...nodeConfig.preview,
      sessionHost: browser.livePreview?.sessionHost,
      resourceResolution: browser.livePreview?.resourceResolution,
      enabled: Boolean(browser.livePreview),
    },
    request: {
      mode: 'hybrid',
      experience: ({ requestUrl }) =>
        primaryExperience(browser, new URL(requestUrl), config.experienceIds[0]),
    },
  };
}

export function singleAppExperiences() {
  return bindAppRouterServerExperiences(configuration(), {
    request: {
      ExperiencesRoot: AppExperiencesRoot,
    },
  });
}

export function singlePagesExperiences() {
  return bindPagesRouterServerExperiences({
    ...configuration(),
    origin: getServer().config.origin,
  });
}
