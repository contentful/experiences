// Destination request bindings. Pages GSSP removes this module from the client bundle.
import {
  applyAppRouterOutcome,
  bindAppRouterServerExperiences,
  type AppRouterServerConfig,
} from '@contentful/experiences-nextjs/app-router/server';
import {
  bindPagesRouterServerExperiences,
  getPagesRouterOutcome,
  type RequestResult,
} from '@contentful/experiences-nextjs/pages-router/server';
import type { CookieReader } from '@contentful/experiences-nextjs/server';
import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next';
import { getServer } from './config';
import { experienceConfig } from './components/ExperienceContent';
import { readConsent } from './server-reference';
import {
  destinationRedirectLocation,
  destinationSelector,
  referenceRequestMode,
  type BrowserEnvironment,
  type DestinationRouter,
  type DestinationSettings,
} from './reference';

// One primary per request, selected from the request URL so App's memoized
// loadExperience() and the request components share a single Destination fetch.
function configuration(
  router: DestinationRouter,
  destination: DestinationSettings
): AppRouterServerConfig {
  const { nodeConfig, browser } = getServer();
  return {
    ...nodeConfig,
    config: experienceConfig,
    browser: {
      delivery: browser.web.delivery,
      ...(browser.web.preview ? { preview: browser.web.preview } : {}),
    },
    consent: { server: ({ cookies }: { cookies: CookieReader }) => readConsent(cookies) },
    request: {
      // ssr: ordinary Destination fetch with server page ownership.
      // hybrid: fetchDestinationForHandoff, server preflight and browser replay.
      mode: ({ requestUrl }) => referenceRequestMode(new URL(requestUrl)),
      experience: ({ requestUrl }) => destinationSelector(destination, new URL(requestUrl), router),
    },
  };
}

/** Loads the App Router primary, routing a redirect or missing content before render. */
export async function loadAppDestination(destination: DestinationSettings) {
  const binding = bindAppRouterServerExperiences(configuration('app', destination));
  return applyAppRouterOutcome(await binding.request.loadExperience(), {
    redirectLocation: destinationRedirectLocation('app'),
  });
}

export type DestinationPagesProps =
  | {
      singleExperience: true;
      environment: BrowserEnvironment;
      experiences: RequestResult;
      serverOnly: boolean;
    }
  | { notConfigured: true; serverOnly: boolean };

/** Pages GSSP: a redirect or 404 is returned before `{ props }`. */
export async function destinationServerSideProps(
  context: GetServerSidePropsContext
): Promise<GetServerSidePropsResult<DestinationPagesProps>> {
  const { browser, config } = getServer();
  const serverOnly = referenceRequestMode(new URL(context.resolvedUrl, config.origin)) === 'ssr';
  if (!browser.destination) return { props: { notConfigured: true, serverOnly } };
  const experiences = await bindPagesRouterServerExperiences({
    ...configuration('pages', browser.destination),
    origin: config.origin,
  }).request.loadExperience(context);
  const outcome = getPagesRouterOutcome(experiences, {
    redirectLocation: destinationRedirectLocation('pages'),
  });
  if (outcome) return outcome;
  return { props: { singleExperience: true, environment: browser, experiences, serverOnly } };
}
