'use client';

import { useLayoutEffect, type ReactNode } from 'react';
import type { PublicEnvironment } from '../public-config';
import type { AttemptLog } from './attempt-log';
import { Navigation, routeUrl } from './Navigation';
import { DESTINATION_NODE_ROUTE, destinationPathForRoute } from './routes';
import { TrackingLog } from './TrackingLog';

export function PageShell({
  url,
  log,
  destination,
  loading = false,
  children,
}: {
  url: URL;
  log: AttemptLog;
  destination?: PublicEnvironment['DESTINATION'];
  loading?: boolean;
  children?: ReactNode;
}) {
  const home = url.pathname === '/';
  const pageTwo = url.pathname === '/page-two';
  const destinationView =
    url.pathname === DESTINATION_NODE_ROUTE || destinationPathForRoute(url.pathname) !== undefined;
  const title = home
    ? 'React SDK'
    : pageTwo
      ? 'Page Two'
      : destinationView
        ? url.pathname === DESTINATION_NODE_ROUTE
          ? 'Destination node'
          : 'Destination path'
        : 'Page not found';
  useLayoutEffect(() => {
    document.title = `${title} – Contentful Experiences`;
  }, [title]);
  return (
    <div className="app-shell">
      <Navigation url={url} destination={destination} />
      <div className="app-body">
        <aside className="app-sidebar" aria-label="Tracking">
          <TrackingLog log={log} />
        </aside>
        <main className="app-main" id="app-main" tabIndex={-1} aria-busy={loading}>
          <div
            className="page-header"
            data-testid={
              home
                ? 'home-view'
                : pageTwo
                  ? 'page-two-view'
                  : destinationView
                    ? 'destination-view'
                    : 'not-found-view'
            }
          >
            {!home && (
              <a href={routeUrl('/', url)} data-testid="link-back-home">
                Back to Home
              </a>
            )}
            <h1>{title}</h1>
            <p className="page-header__subtitle">
              {home || pageTwo
                ? 'Standalone React rendering reference for @contentful/experiences-react.'
                : destinationView
                  ? 'Managed Destination content for @contentful/experiences-react.'
                  : 'This reference has Home, Page Two and Destination routes.'}
            </p>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
