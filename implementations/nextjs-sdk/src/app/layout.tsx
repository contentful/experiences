import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '../theme.css';

export const metadata: Metadata = {
  title: { default: 'Next SDK – Contentful Experiences', template: '%s – Contentful Experiences' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
