'use client';

import { createLivePreviewClient } from '@contentful/experiences-live-preview';
import {
  bindAppRouterClientExperiences,
  type RequestExperienceProps,
} from '@contentful/experiences-nextjs/app-router/client';
import { bindPagesRouterExperiences } from '@contentful/experiences-nextjs/pages-router';
import { browserRegistry } from './browser-registry';

const preview =
  process.env.NEXT_PUBLIC_LIVE_PREVIEW_ENABLED === 'true'
    ? { createClient: createLivePreviewClient }
    : undefined;

const app = bindAppRouterClientExperiences({ config: browserRegistry, preview }).request;
const { Experience: AppRequestExperience } = app;
export const AppExperiencesRoot = app.ExperiencesAnalyticsRoot;
export const ClientRequestRoot = app.ExperiencesRoot;
export const { ExperiencesRoot, Experience } = bindPagesRouterExperiences({
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

export function ClientRequestExperience(props: RequestExperienceProps) {
  return <AppRequestExperience {...singleExperienceFallbacks} {...props} />;
}
