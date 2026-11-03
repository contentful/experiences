'use client';

import {
  bindNextjsAppRouterClientExperiences,
  type NextjsRequestExperienceProps,
} from '@contentful/experiences-nextjs/app-router/client';
import { browserRegistry } from './browser-registry';

const bound = bindNextjsAppRouterClientExperiences({ config: browserRegistry });

export function ClientRequestExperience(props: NextjsRequestExperienceProps) {
  return (
    <bound.request.Experience
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
