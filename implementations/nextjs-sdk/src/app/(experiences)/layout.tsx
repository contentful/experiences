import type { ReactNode } from 'react';

export default function ExperiencesLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <nav aria-label="Main navigation">
        <a href="/">Home</a>
        <a href="/page-two">Page Two</a>
      </nav>
      <div className="app-body">{children}</div>
    </div>
  );
}
