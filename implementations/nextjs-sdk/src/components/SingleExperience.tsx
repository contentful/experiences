'use client';

import {
  bindAppRouterClientExperiences,
  type RequestExperienceProps,
} from '@contentful/experiences-nextjs/app-router/client';
import { bindPagesRouterExperiences } from '@contentful/experiences-nextjs/pages-router';
import { browserRegistry } from './browser-registry';

const livePreview = {
  enabled: true,
  loadImplementation: () => import('@contentful/experiences-live-preview'),
};

const { ExperiencesRoot: AppExperiencesRoot, Experience: AppRequestExperience } =
  bindAppRouterClientExperiences({ config: browserRegistry, livePreview }).request;
export { AppExperiencesRoot };
export const { ExperiencesRoot, Experience } = bindPagesRouterExperiences({
  config: browserRegistry,
  livePreview,
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

export function ClientRequestExperience(props: RequestExperienceProps) {
  return <AppRequestExperience {...singleExperienceFallbacks} {...props} />;
}
