'use client';

import { createLivePreviewClient } from '@contentful/experiences-live-preview';
import {
  bindNextjsAppRouterClientExperiences,
  type NextjsRequestExperienceProps,
} from '@contentful/experiences-nextjs/app-router/client';
import { bindNextjsPagesRouterExperiences } from '@contentful/experiences-nextjs/pages-router';
import { browserRegistry } from './browser-registry';

const preview = {
  enabled: true,
  createClient: createLivePreviewClient,
};

const app = bindNextjsAppRouterClientExperiences({ config: browserRegistry, preview }).request;
const { Experience: AppRequestExperience } = app;
export const AppExperiencesRoot = app.ExperiencesAnalyticsRoot;
export const ClientRequestRoot = app.ExperiencesRoot;
export const { ExperiencesRoot, Experience } = bindNextjsPagesRouterExperiences({
  config: browserRegistry,
  preview,
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
