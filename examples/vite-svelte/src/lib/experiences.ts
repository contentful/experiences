import { createExperiences } from '@contentful/experiences-svelte';

import { experienceConfig } from './experience-config.js';
import { navigate } from './navigation.svelte.js';

export const { ExperiencesRoot, Experience } = createExperiences({
  config: experienceConfig,
  onRedirect({ path }) {
    // Application policy: only local root-relative paths; replace the redirecting entry.
    // eslint-disable-next-line no-control-regex -- Reject control characters before parsing the URL.
    if (!path.startsWith('/') || path.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(path)) {
      throw new TypeError('The Destination redirect is not a permitted local path.');
    }
    navigate(new URL(path, window.location.origin), true);
  },
});
