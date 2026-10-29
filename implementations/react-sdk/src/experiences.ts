import { createReactExperiences } from '@contentful/experiences-react/client';

import { experienceConfig } from './experience-config';

// Bind the presentation registry once; the host owns the shared browser runtime.
export const { ExperiencesRoot, ExperienceRenderer } = createReactExperiences({
  config: experienceConfig,
});
