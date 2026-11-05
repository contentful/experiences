import 'server-only';

import { bindNextjsAppRouterServerExperiences } from '@contentful/experiences-nextjs/app-router/server';
import { getServer } from './config';
import { experienceConfig } from './components/ExperienceContent';
import { ClientRequestExperience } from './components/SingleExperience';
import { readConsent } from './server-reference';

export function singleAppExperiences() {
  const { nodeConfig, browser, config } = getServer();
  return bindNextjsAppRouterServerExperiences(
    {
      ...nodeConfig,
      config: experienceConfig,
      browser: { delivery: browser.web.delivery, isPreview: false },
      consent: { server: ({ cookies }) => readConsent(cookies) },
      request: {
        experience: {
          experienceId: config.experienceIds[0],
          extensions: { sourceMap: {} },
        },
        hydration: 'preserve-server',
      },
    },
    { request: { Experience: ClientRequestExperience } }
  );
}
