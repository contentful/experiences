import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '../theme.css';

export const metadata: Metadata = {
  title: { default: 'Next SDK – Contentful Experiences', template: '%s – Contentful Experiences' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <nav aria-label="Main navigation">
            <a href="/">Home</a>
            <a href="/page-two">Page Two</a>
          </nav>
          <div className="app-body">{children}</div>
        </div>
      </body>
    </html>
  );
}
