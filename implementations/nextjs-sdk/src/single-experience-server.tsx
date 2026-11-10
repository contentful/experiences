// Shared server configuration; Pages GSSP removes this module from the client bundle.
import {
  bindAppRouterServerExperiences,
  type AppRouterServerExperiencesConfig,
} from '@contentful/experiences-nextjs/app-router/server';
import { bindPagesRouterServerExperiences } from '@contentful/experiences-nextjs/pages-router/server';
import type { CookieReader } from '@contentful/experiences-nextjs/server';
import { getServer } from './config';
import { experienceConfig } from './components/ExperienceContent';
import { AppExperiencesRoot, ClientRequestExperience } from './components/SingleExperience';
import { readConsent, serverPreview } from './server-reference';

function configuration(): AppRouterServerExperiencesConfig {
  const { nodeConfig, config, browser } = getServer();
  return {
    ...nodeConfig,
    config: experienceConfig,
    browser: {
      delivery: browser.web.delivery,
      ...(browser.web.preview ? { preview: browser.web.preview } : {}),
    },
    consent: { server: ({ cookies }: { cookies: CookieReader }) => readConsent(cookies) },
    livePreview: {
      ...browser.livePreview,
      enabled: Boolean(browser.livePreview),
      loadImplementation: () => import('@contentful/experiences-live-preview'),
    },
    request: {
      experience: ({ requestUrl }) => {
        const url = new URL(requestUrl);
        const preview = Boolean(serverPreview(url));
        return {
          experienceId:
            (preview &&
              (url.searchParams.get('preview_experience_id')?.trim() ||
                browser.livePreview?.experienceId)) ||
            config.experienceIds[0],
          ...(preview ? {} : { extensions: { sourceMap: {} } }),
        };
      },
      hydration: 'preserve-server' as const,
    },
  };
}

export function singleAppExperiences() {
  return bindAppRouterServerExperiences(configuration(), {
    request: {
      ExperiencesRoot: AppExperiencesRoot,
      Experience: ClientRequestExperience,
    },
  });
}

export function singlePagesExperiences() {
  return bindPagesRouterServerExperiences({
    ...configuration(),
    origin: getServer().config.origin,
  });
}
