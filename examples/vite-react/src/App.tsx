import { ExperiencePage } from './ExperiencePage';
import { HomePage } from './HomePage';

/**
 * Two routes: `/` and `/:experienceId`. Read straight off `location` so the
 * example has no router dependency; swap in React Router or TanStack Router
 * in a real app; nothing SDK-related changes. Vite's dev and preview servers
 * fall back to `index.html` for unknown paths, so deep links work.
 */
export function App() {
  const experienceId = decodeURIComponent(window.location.pathname.slice(1).split('/')[0] ?? '');
  if (!experienceId) return <HomePage />;

  const query = new URL(window.location.href).searchParams;
  return (
    <ExperiencePage
      experienceId={experienceId}
      locale={query.get('locale') ?? 'en-US'}
      debug={query.get('debug') === 'true' || query.get('debug') === '1'}
    />
  );
}
