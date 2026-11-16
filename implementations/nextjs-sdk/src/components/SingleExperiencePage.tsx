import type { ReactNode } from 'react';
import Link from 'next/link';

export function SingleExperiencePage({
  children,
  pages = false,
}: {
  children: ReactNode;
  pages?: boolean;
}) {
  return (
    <div className="app-shell">
      <nav className="app-nav" aria-label="Main navigation">
        <Link href={pages ? '/pages' : '/'} prefetch={false}>
          Diagnostic examples
        </Link>
        <a href={pages ? '/single-experience' : '/pages/single-experience'}>
          {pages ? 'App Router' : 'Pages Router'} single Experience
        </a>
      </nav>
      <main className="app-main">
        <header className="page-header">
          <h1>Single Experience</h1>
          <p className="page-header__subtitle">
            One server-evaluated Experience with browser-managed {pages ? 'Pages' : 'App'} Router
            presentation.
          </p>
        </header>
        {children}
      </main>
    </div>
  );
}
