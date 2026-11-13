import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  destinationRoute,
  destinationRoutes,
  type DestinationRouter,
  type DestinationSettings,
} from '../reference';

// Shared App/Pages shell. Standard links navigate client-side within one router and
// rendering mode; switching router or mode uses a full document navigation.
export function DestinationPage({
  router,
  destination,
  serverOnly,
  children,
}: {
  router: DestinationRouter;
  destination?: DestinationSettings;
  serverOnly: boolean;
  children: ReactNode;
}) {
  const other: DestinationRouter = router === 'app' ? 'pages' : 'app';
  const query = serverOnly ? '?mode=server-only' : '';
  const links = destination
    ? [
        { label: 'Home /', href: destinationRoute('/', router, serverOnly) },
        {
          label: `Path ${destination.path}`,
          href: destinationRoute(destination.path, router, serverOnly),
        },
        { label: `Node ${destination.nodeId}`, href: `${destinationRoutes[router].node}${query}` },
        {
          label: `Redirect ${destination.redirectPath}`,
          href: destinationRoute(destination.redirectPath, router, serverOnly),
        },
        {
          label: `Missing ${destination.missingPath}`,
          href: destinationRoute(destination.missingPath, router, serverOnly),
        },
      ]
    : [];
  return (
    <div className="app-shell">
      <nav className="app-nav" aria-label="Main navigation">
        <a href={router === 'app' ? '/' : '/pages'}>Diagnostic examples</a>
        {links.map(({ label, href }) => (
          <Link key={label} href={href} prefetch={false}>
            {label}
          </Link>
        ))}
        <a href={`${destinationRoutes[router].prefix}${serverOnly ? '' : '?mode=server-only'}`}>
          {serverOnly ? 'Hybrid' : 'Server-only (SSR)'} rendering
        </a>
        <a href={`${destinationRoutes[other].prefix}${query}`}>
          {other === 'app' ? 'App' : 'Pages'} Router Destination
        </a>
      </nav>
      <main className="app-main">
        <header className="page-header">
          <h1>Destination</h1>
          <p className="page-header__subtitle">
            One server-evaluated Destination primary with browser-managed{' '}
            {router === 'app' ? 'App' : 'Pages'} Router presentation, in{' '}
            {serverOnly ? 'SSR' : 'hybrid'} request mode. Destination plans carry no source-map
            attribution, so automatic view, hover and click tracking does not fire for this content.
          </p>
        </header>
        {destination ? (
          children
        ) : (
          <p className="placeholder-card" role="status" data-testid="destination-not-configured">
            Destination routes are not configured. Set DESTINATION_ID in this app&apos;s .env; the
            other routes are unaffected.
          </p>
        )}
      </main>
    </div>
  );
}
