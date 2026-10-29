import { createReactExperiences } from '@contentful/experiences-react/client';

import { experienceConfig } from './experience-config';

// Bind the presentation registry once; the host owns the shared browser runtime.
export const experiences = createReactExperiences({ config: experienceConfig });
