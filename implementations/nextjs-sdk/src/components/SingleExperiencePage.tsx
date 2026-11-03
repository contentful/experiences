import type { ReactNode } from 'react';
import Link from 'next/link';

export function SingleExperiencePage({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <nav className="app-nav" aria-label="Main navigation">
        <Link href="/" prefetch={false}>
          Server examples
        </Link>
      </nav>
      <main className="app-main">
        <header className="page-header">
          <h1>Single Experience</h1>
          <p className="page-header__subtitle">
            One configured Experience with the built-in App Router root.
          </p>
        </header>
        {children}
      </main>
    </div>
  );
}
