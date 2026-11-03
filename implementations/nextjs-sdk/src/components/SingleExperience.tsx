'use client';

import {
  bindNextjsAppRouterClientExperiences,
  type NextjsRequestExperienceProps,
} from '@contentful/experiences-nextjs/app-router/client';
import { bindNextjsPagesRouterExperiences } from '@contentful/experiences-nextjs/pages-router';
import { browserRegistry } from './browser-registry';

const livePreview = {
  enabled: true,
  loadImplementation: () => import('@contentful/experiences-live-preview'),
};

const { ExperiencesRoot: AppExperiencesRoot, Experience: AppRequestExperience } =
  bindNextjsAppRouterClientExperiences({ config: browserRegistry, livePreview }).request;
export { AppExperiencesRoot };
export const ClientRequestRoot = AppExperiencesRoot;
export const { ExperiencesRoot, Experience } = bindNextjsPagesRouterExperiences({
  config: browserRegistry,
  livePreview,
}).request;
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
