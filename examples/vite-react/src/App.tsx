import { ExperiencePage } from './ExperiencePage';

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
  const query = new URL(window.location.href).searchParams;
  const locale = query.get('locale') ?? 'en-US';
  const debug = query.get('debug') === 'true' || query.get('debug') === '1';

  const byId = /^\/experiences\/([^/]+)\/?$/.exec(window.location.pathname);
  if (byId) {
    return (
      <ExperiencePage experienceId={decodeURIComponent(byId[1]!)} locale={locale} debug={debug} />
    );
  }
  return (
    <ExperiencePage destinationPath={window.location.pathname} locale={locale} debug={debug} />
  );
}
