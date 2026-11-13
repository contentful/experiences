import { createExperiences, NotFoundError } from '@contentful/experiences-react/client';

import { env } from './lib/env';
import { experienceConfig } from './lib/experience-config';

const { ExperiencesRoot, Experience, ExperienceRenderer } = createExperiences({
  config: experienceConfig,
  onRedirect: ({ path }) => window.location.replace(path),
});

interface ExperiencePageProps {
  /** Fetch by Destination path, without the query string. */
  destinationPath?: string;
  /** Fetch by Experience id. Set exactly one of `destinationPath` and `experienceId`. */
  experienceId?: string;
  locale: string;
  debug: boolean;
}

/**
 * One managed owner fetches, resolves and presents a Destination path or Experience
 * id. The card's async `resolveData` runs in the browser. A Destination redirect
 * is followed by the bound `onRedirect` callback.
 *
 * The delivery token ships in the bundle (see `lib/env.ts`), and content arrives
 * after loading. Crawlers that do not run JavaScript see an empty page.
 */
export function ExperiencePage({
  destinationPath,
  experienceId,
  locale,
  debug,
}: ExperiencePageProps) {
  if (!env.spaceId || !env.accessToken || (destinationPath !== undefined && !env.destinationId)) {
    return (
      <p role="alert">
        VITE_SPACE_ID, VITE_DESTINATION_ID and VITE_CDA_TOKEN must be set. Copy .env.example to
        .env.local and fill them in.
      </p>
    );
  }

  const selector =
    destinationPath !== undefined
      ? { destinationId: env.destinationId, path: destinationPath }
      : { experienceId: experienceId! };

  return (
    <ExperiencesRoot
      spaceId={env.spaceId}
      environmentId={env.environmentId}
      delivery={{ accessToken: env.accessToken }}
      locale={locale}
      routeKey={window.location.pathname + window.location.search}
    >
      <Experience
        {...selector}
        locale={locale}
        resolveOptions={{ metadata: { slug: destinationPath ?? experienceId, locale }, debug }}
      >
        {({ data, error, redirect }) => {
          if (redirect) return <p role="status">Redirecting…</p>;
          if (error instanceof NotFoundError && !data) {
            return <p role="alert">Experience not found.</p>;
          }
          if (error && !data) {
            return <p role="alert">Could not load the experience: {error.message}</p>;
          }
          if (!data) return <p role="status">Loading experience…</p>;
          return (
            <>
              {error && <p role="status">Could not refresh. Showing the last valid experience.</p>}
              <ExperienceRenderer experience={data} debug={debug} />
            </>
          );
        }}
      </Experience>
    </ExperiencesRoot>
  );
}
