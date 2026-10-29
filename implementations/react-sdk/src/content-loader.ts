import { fetchExperience, type PortableRenderPlan } from '@contentful/experiences-react/client';

import type { PublicEnvironment } from '../public-config';
import { experienceConfig } from './experience-config';

export type ContentResult =
  { plan: PortableRenderPlan; error?: never } | { error: string; plan?: never };
export type PageContent = Record<string, ContentResult>;

export function getRouteExperienceIds(environment: PublicEnvironment, pathname: string) {
  const ids = environment.EXPERIENCE_IDS;
  return {
    automatic: pathname === '/' ? ids : pathname === '/page-two' ? ids.slice(-1) : [],
    manual: pathname === '/' || pathname === '/page-two' ? ids.slice(0, 1) : [],
  };
}

// Application-owned free fetching remains a supported path. Start this once
// outside React's render/effect replay, then supply the resulting plans to React.
export async function loadPageContent(
  environment: PublicEnvironment,
  pathname: string
): Promise<PageContent> {
  const ids = getRouteExperienceIds(environment, pathname);
  const distinctIds = [...new Set([...ids.automatic, ...ids.manual])];
  const results = await Promise.all(
    distinctIds.map(async (experienceId): Promise<ContentResult> => {
      if (!environment.SPACE_ID || !environment.CDA_TOKEN) {
        return {
          error:
            'Configure SPACE_ID and a browser-approved CDA_TOKEN in this app’s .env to load content.',
        };
      }
      try {
        const plan = await fetchExperience(
          {
            spaceId: environment.SPACE_ID,
            environmentId: environment.ENVIRONMENT_ID,
            experienceId,
            locale: environment.LOCALE,
            extensions: { sourceMap: {} },
          },
          { accessToken: environment.CDA_TOKEN },
          { config: experienceConfig }
        );
        return { plan };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : 'The Experience request failed.',
        };
      }
    })
  );
  const content: PageContent = {};
  distinctIds.forEach((experienceId, index) => {
    content[experienceId] = results[index];
  });
  return content;
}
