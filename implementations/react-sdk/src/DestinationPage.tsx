'use client';

import {
  isNotFoundError,
  useRuntimeContext,
  type DestinationNodeSelector,
  type DestinationPathSelector,
  type ExperienceRedirect,
} from '@contentful/experiences-react/client';
import { useCallback, useEffect, useState } from 'react';
import type { PublicEnvironment } from '../public-config';
import type { AttemptLog } from './attempt-log';
import { ConsentControls } from './ConsentControls';
import { ExperiencePresentation } from './ExperiencePresentation';
import { useManagedExperience } from './experiences';
import { routeUrl, type OnIntent, type PageIntent } from './Navigation';
import { PageShell } from './PageShell';
import { destinationPathForRoute, destinationRoute } from './routes';

type Destination = NonNullable<PublicEnvironment['DESTINATION']>;

export function DestinationPage({
  intent,
  onIntent,
  destination,
  log,
}: {
  intent: PageIntent;
  onIntent: OnIntent;
  destination: PublicEnvironment['DESTINATION'];
  log: AttemptLog;
}) {
  if (!destination)
    return (
      <PageShell url={intent.url} log={log}>
        <section className="page-section">
          <p role="status" className="placeholder-card" data-testid="destination-not-configured">
            Destination routes are not configured. Set DESTINATION_ID in this app&apos;s .env to
            load content from a Destination; Home and Page Two are unaffected.
          </p>
        </section>
      </PageShell>
    );
  return (
    <DestinationContent intent={intent} onIntent={onIntent} destination={destination} log={log} />
  );
}

// One primary per page: this managed result owns the page's only content request.
function DestinationContent({
  intent,
  onIntent,
  destination,
  log,
}: {
  intent: PageIntent;
  onIntent: OnIntent;
  destination: Destination;
  log: AttemptLog;
}) {
  const path = destinationPathForRoute(intent.url.pathname);
  const selector: DestinationPathSelector | DestinationNodeSelector =
    path === undefined
      ? { destinationId: destination.id, nodeId: destination.nodeId }
      : { destinationId: destination.id, path };
  // The SDK never navigates: map the Destination path to this app's route and replace
  // the redirecting entry, as an HTTP redirect would.
  const onExperienceRedirect = useCallback(
    (redirect: ExperienceRedirect) =>
      onIntent(
        new URL(routeUrl(destinationRoute(redirect.path), intent.url), intent.url),
        undefined,
        'replace'
      ),
    [intent.url, onIntent]
  );
  const result = useManagedExperience({
    ...selector,
    personalization: intent.personalization,
    onExperienceRedirect,
  });
  const label = path === undefined ? `node ${destination.nodeId}` : path;
  const notFound = isNotFoundError(result.error);
  return (
    <PageShell
      url={intent.url}
      log={log}
      destination={destination}
      loading={result.status === 'loading'}
    >
      <ConsentControls intent={intent} onIntent={onIntent} result={result} />
      <div className="sections-grid">
        <section className="page-section">
          <header className="page-section__header">
            <h2>Destination {label}</h2>
            <p>
              The SDK resolves this {path === undefined ? 'node' : 'path'} through the Destinations
              API and manages loading, errors and Retry. Destination plans carry no source-map
              attribution (the Destinations API accepts no sourceMap extension), so automatic views,
              hovers and clicks are not tracked for this content.
            </p>
          </header>
          <div className="entry-grid entry-grid--experiences">
            {result.status === 'redirect' ? (
              <p role="status" className="placeholder-card" data-testid="destination-redirect">
                Redirecting to {result.redirect?.path}…
              </p>
            ) : notFound ? (
              <p role="alert" className="placeholder-card" data-testid="destination-not-found">
                Destination {label} was not found.
              </p>
            ) : (
              <ExperiencePresentation
                experienceId={result.data?.experienceId ?? label}
                result={result}
              />
            )}
          </div>
          <p className="control-panel__note">
            Try the{' '}
            <a href={routeUrl(destinationRoute(destination.redirectPath), intent.url)}>
              redirect path {destination.redirectPath}
            </a>{' '}
            or the{' '}
            <a href={routeUrl(destinationRoute(destination.missingPath), intent.url)}>
              missing path {destination.missingPath}
            </a>
            .
          </p>
        </section>
        <DestinationSitemap
          destination={destination}
          url={intent.url}
          ready={result.status !== 'idle' && result.status !== 'loading'}
        />
      </div>
    </PageShell>
  );
}

type SitemapState = { paths: { path: string; type: string }[] } | { error: Error };

// Event-free enumeration after the primary settles; it fetches no Experience content.
function DestinationSitemap({
  destination,
  url,
  ready,
}: {
  destination: Destination;
  url: URL;
  ready: boolean;
}) {
  const { sdk, isLive } = useRuntimeContext();
  const [sitemap, setSitemap] = useState<SitemapState>();
  useEffect(() => {
    if (!isLive || !ready) return;
    let active = true;
    sdk.fetchDestinationSitemap({ destinationId: destination.id }, { limit: 20 }).then(
      (result) => {
        if (active)
          setSitemap({
            paths: result.items.map(({ path, type }) => ({ path, type: String(type) })),
          });
      },
      (error: unknown) => {
        if (active)
          setSitemap({
            error: error instanceof Error ? error : new Error('The sitemap request failed.'),
          });
      }
    );
    return () => {
      active = false;
    };
  }, [sdk, isLive, ready, destination.id]);
  return (
    <section className="page-section" aria-label="Destination sitemap">
      <header className="page-section__header">
        <h2>Destination sitemap</h2>
        <p>The first sitemap page, listed without fetching or resolving Experiences.</p>
      </header>
      {!sitemap ? (
        <p role="status" className="page-loading">
          {ready ? 'Loading sitemap…' : 'Waiting for page content…'}
        </p>
      ) : 'error' in sitemap ? (
        <p role="alert" className="placeholder-card">
          {sitemap.error.message}
        </p>
      ) : (
        <ul data-testid="destination-sitemap">
          {sitemap.paths.map(({ path, type }) => (
            <li key={path}>
              <a href={routeUrl(destinationRoute(path), url)}>{path}</a> <small>({type})</small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
