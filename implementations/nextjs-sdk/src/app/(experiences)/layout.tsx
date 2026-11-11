import type { ReactNode } from 'react';
import { loadServerPage } from '../../server-loader';

export const dynamic = 'force-dynamic';

export default async function ExperiencesLayout({ children }: { children: ReactNode }) {
  let content: ReactNode;
  const { ExperiencesRoot, serverOnly, analytics } = await loadServerPage();
  if (!serverOnly || analytics) {
    content = <ExperiencesRoot>{children}</ExperiencesRoot>;
  } else {
    content = (
      <div className="app-shell">
        <nav className="app-nav" aria-label="Main navigation">
          <a href="/?mode=server-only&analytics=off">Home</a>
          <a href="/page-two?mode=server-only&analytics=off">Page Two</a>
          <a href="/">Hybrid rendering</a>
        </nav>
        <div className="app-body">
          <main className="app-main">{children}</main>
        </div>
      </div>
    );
  }
  return content;
}
