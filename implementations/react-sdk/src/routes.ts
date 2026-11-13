// Reference routing: application paths under /destination map to Destination paths.
// Kept free of React and DOM APIs so the mapping is unit-testable without a browser.
export const DESTINATION_ROUTE = '/destination';
export const DESTINATION_NODE_ROUTE = '/destination-node';

/** The Destination path an application route selects, or undefined for other routes. */
export function destinationPathForRoute(pathname: string) {
  if (pathname !== DESTINATION_ROUTE && !pathname.startsWith(`${DESTINATION_ROUTE}/`))
    return undefined;
  return pathname.slice(DESTINATION_ROUTE.length) || '/';
}

/** The application route that presents a Destination path, e.g. a redirect target. */
export function destinationRoute(path: string) {
  return path === '/' ? DESTINATION_ROUTE : `${DESTINATION_ROUTE}${path}`;
}

/** Routes this single-page reference handles without a document navigation. */
export function isAppRoute(pathname: string) {
  return (
    pathname === '/' ||
    pathname === '/page-two' ||
    pathname === DESTINATION_NODE_ROUTE ||
    destinationPathForRoute(pathname) !== undefined
  );
}
