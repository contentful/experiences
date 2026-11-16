'use client';

import {
  bindNextjsAppRouterClientExperiences,
  type NextjsRequestExperienceProps,
} from '@contentful/experiences-nextjs/app-router/client';
import { browserRegistry } from './browser-registry';

const binding = bindNextjsAppRouterClientExperiences({ config: browserRegistry });

const { Experience, ExperiencesRoot } = binding.request;

export const ClientRequestRoot = ExperiencesRoot;

export function ClientRequestExperience(props: NextjsRequestExperienceProps) {
  return (
    <Experience
      loadingFallback={
        <p className="placeholder-card" role="status">
          Loading Experience…
        </p>
      }
      errorFallback={
        <p className="placeholder-card" role="alert">
          Experience content unavailable.
        </p>
      }
      {...props}
    />
  );
}
