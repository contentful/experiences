'use client';

import {
  bindNextjsAppRouterClientExperiences,
  type NextjsRequestExperienceProps,
} from '@contentful/experiences-nextjs/app-router/client';
import { bindNextjsPagesRouterExperiences } from '@contentful/experiences-nextjs/pages-router';
import { browserRegistry } from './browser-registry';

const app = bindNextjsAppRouterClientExperiences({ config: browserRegistry });
const pages = bindNextjsPagesRouterExperiences({ config: browserRegistry });
const { Experience: AppRequestExperience } = app.request;
export const ClientRequestRoot = app.request.ExperiencesRoot;
const fallbacks = {
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
  return <AppRequestExperience {...fallbacks} {...props} />;
}

export function PagesSingleExperience(props: NextjsRequestExperienceProps) {
  return <pages.request.Experience {...fallbacks} {...props} />;
}
