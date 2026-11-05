'use client';

import {
  bindNextjsAppRouterClientExperiences,
  type NextjsRequestExperienceProps,
} from '@contentful/experiences-nextjs/app-router/client';
import { bindNextjsPagesRouterExperiences } from '@contentful/experiences-nextjs/pages-router';
import { browserRegistry } from './browser-registry';

const { Experience: AppRequestExperience } = bindNextjsAppRouterClientExperiences({
  config: browserRegistry,
}).request;
export const { ExperiencesRoot, Experience } = bindNextjsPagesRouterExperiences({
  config: browserRegistry,
});
export const singleExperienceFallbacks = {
  loadingFallback: (
    <p className="placeholder-card" role="status">
      Loading Experience…
    </p>
  ),
  errorFallback: (
    <p className="placeholder-card" role="alert">
      Experience content unavailable.
    </p>
  ),
};

export function ClientRequestExperience(props: NextjsRequestExperienceProps) {
  return <AppRequestExperience {...singleExperienceFallbacks} {...props} />;
}
