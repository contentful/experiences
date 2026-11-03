// Shared server configuration; Pages GSSP removes this module from the client bundle.
import { bindNextjsAppRouterServerExperiences } from '@contentful/experiences-nextjs/app-router/server';
import { bindNextjsPagesRouterServerExperiences } from '@contentful/experiences-nextjs/pages-router/server';
import type { NextjsCookieReader } from '@contentful/experiences-nextjs/server';
import { getServer } from './config';
import { experienceConfig } from './components/ExperienceContent';
import { ClientRequestExperience } from './components/SingleExperience';
import { readConsent } from './server-reference';

function configuration() {
  const { nodeConfig, browser, config } = getServer();
  return {
    ...nodeConfig,
    config: experienceConfig,
    browser: { delivery: browser.web.delivery, isPreview: false },
    consent: { server: ({ cookies }: { cookies: NextjsCookieReader }) => readConsent(cookies) },
    request: {
      experience: { experienceId: config.experienceIds[0], extensions: { sourceMap: {} } },
      hydration: 'preserve-server' as const,
    },
  };
}

export function singleAppExperiences() {
  return bindNextjsAppRouterServerExperiences(configuration(), {
    request: { Experience: ClientRequestExperience },
  });
}

export function singlePagesExperiences() {
  return bindNextjsPagesRouterServerExperiences({
    ...configuration(),
    origin: getServer().config.origin,
  });
}
