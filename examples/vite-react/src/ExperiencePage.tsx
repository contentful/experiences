import { useEffect, useState } from 'react';

import {
  ClientExperienceRenderer,
  NotFoundError,
  fetchExperience,
  type PortableRenderPlan,
} from '@contentful/experiences-react';

import { env } from './lib/env';
import { experienceConfig } from './lib/experience-config';

interface ExperiencePageProps {
  experienceId: string;
  locale: string;
  debug: boolean;
}

type State =
  | { status: 'loading' }
  | { status: 'ready'; experience: PortableRenderPlan }
  | { status: 'not-found' }
  | { status: 'error'; message: string };

/**
 * The client-only flow: the same `fetchExperience` call the Next.js example
 * makes on the server, run in an effect instead. It fetches from the
 * Experience Delivery API, resolves the plan (including `card`'s async
 * `resolveData`), and hands the result to `ClientExperienceRenderer`.
 *
 * What a server would otherwise give you, and what you take on here:
 * - The delivery token ships in the bundle (see `lib/env.ts`).
 * - Nothing renders until the fetch and resolve finish, so handle loading.
 * - Crawlers that don't run JavaScript see an empty page.
 */
export function ExperiencePage({ experienceId, locale, debug }: ExperiencePageProps) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    // Ignore a fetch that resolves after the props changed or the page
    // unmounted (StrictMode mounts effects twice in development).
    let isCurrent = true;
    setState({ status: 'loading' });

    if (!env.spaceId || !env.accessToken) {
      setState({
        status: 'error',
        message:
          'VITE_SPACE_ID and VITE_CDA_TOKEN must be set. Copy .env.example to .env.local and fill them in.',
      });
      return;
    }

    fetchExperience(
      { spaceId: env.spaceId, environmentId: env.environmentId, experienceId, locale },
      { accessToken: env.accessToken },
      { config: experienceConfig, metadata: { slug: experienceId, locale }, debug }
    ).then(
      (experience) => {
        if (isCurrent) setState({ status: 'ready', experience });
      },
      (error: unknown) => {
        if (!isCurrent) return;
        if (error instanceof NotFoundError) {
          setState({ status: 'not-found' });
          return;
        }
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    );

    return () => {
      isCurrent = false;
    };
  }, [experienceId, locale, debug]);

  switch (state.status) {
    case 'loading':
      return <p role="status">Loading experience…</p>;
    case 'not-found':
      return <p role="alert">Experience not found.</p>;
    case 'error':
      return <p role="alert">Could not load the experience: {state.message}</p>;
    case 'ready':
      return (
        <ClientExperienceRenderer
          experience={state.experience}
          config={experienceConfig}
          debug={debug}
        />
      );
  }
}
