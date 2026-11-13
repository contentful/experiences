import {
  createExperiences,
  NotFoundError,
  type BoundManagedExperienceOptions,
} from '@contentful/experiences-react/client';

import { env } from './lib/env';
import { experienceConfig } from './lib/experience-config';

const { ExperiencesRoot, Experience } = createExperiences({
  config: experienceConfig,
  onRedirect: ({ path }) => window.location.replace(path),
});

/**
 * Two routes, read straight off `location` so the example has no router
 * dependency; swap in React Router or TanStack Router in a real app; nothing
 * SDK-related changes:
 * - `/experiences/:id` fetches one Experience by id.
 * - Every other path, including `/`, is a Destination path.
 * Vite's dev and preview servers fall back to `index.html` for unknown paths,
 * so deep links work.
 */
export function App() {
  const url = new URL(window.location.href);
  const locale = url.searchParams.get('locale') ?? 'en-US';
  const debug = ['true', '1'].includes(url.searchParams.get('debug') ?? '');
  const byId = /^\/experiences\/([^/]+)\/?$/.exec(url.pathname);
  const selector: BoundManagedExperienceOptions = byId
    ? { experienceId: decodeURIComponent(byId[1]) }
    : { destinationId: env.destinationId, path: url.pathname };

  if (!env.spaceId || !env.accessToken || ('path' in selector && !env.destinationId)) {
    return (
      <p role="alert">
        VITE_SPACE_ID, VITE_DESTINATION_ID and VITE_CDA_TOKEN must be set. Copy .env.example to
        .env.local and fill them in.
      </p>
    );
  }

  return (
    <ExperiencesRoot
      spaceId={env.spaceId}
      environmentId={env.environmentId}
      delivery={{ accessToken: env.accessToken }}
      locale={locale}
      routeKey={url.pathname + url.search}
    >
      <Experience
        {...selector}
        resolveOptions={{
          metadata: { slug: byId ? selector.experienceId : url.pathname, locale },
          debug,
        }}
        loadingFallback={<p role="status">Loading experience…</p>}
        errorFallback={({ error }) => (
          <p role="alert">
            {error instanceof NotFoundError
              ? 'Experience not found.'
              : `Could not load the experience: ${error?.message}`}
          </p>
        )}
      />
    </ExperiencesRoot>
  );
}
