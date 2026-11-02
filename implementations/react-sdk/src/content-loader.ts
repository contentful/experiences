import type { ManagedExperienceResult } from '@contentful/experiences-react/client';

import type { PublicEnvironment } from '../public-config';
import { experienceConfig } from './experience-config';

export type ContentResult = Pick<ManagedExperienceResult, 'data' | 'error'>;
export type PageContent = Record<string, ContentResult>;

export function getRouteExperienceIds(environment: PublicEnvironment, pathname: string) {
  const ids = environment.EXPERIENCE_IDS;
  return {
    automatic: pathname === '/' ? ids : pathname === '/page-two' ? ids.slice(-1) : [],
    manual: pathname === '/' || pathname === '/page-two' ? ids.slice(0, 1) : [],
  };
}

// Reference-only comparison loop: the first ID belongs to the managed loader.
// Later IDs fetch without events and reuse their plans across presentations.
export async function loadComparisonContent(
  sdk: import('@contentful/experiences-web').ContentfulExperiences,
  experienceIds: readonly string[],
  isCurrent: () => boolean
): Promise<PageContent> {
  const content: PageContent = {};
  for (const experienceId of experienceIds) {
    if (!isCurrent()) break;
    try {
      const data = await sdk.fetchExperience({ experienceId }, { config: experienceConfig });
      if (!isCurrent()) break;
      content[experienceId] = { data, error: undefined };
    } catch (error) {
      if (!isCurrent()) break;
      content[experienceId] = {
        data: undefined,
        error: error instanceof Error ? error : new Error('The Experience request failed.'),
      };
    }
  }
  return content;
}
