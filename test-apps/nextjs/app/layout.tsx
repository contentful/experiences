import type { ReactNode } from 'react';

export const metadata = {
  title: 'Contentful Experiences — Next.js example',
  description: 'Demonstrates @contentful/experiences-react with the Next.js App Router.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          background: '#f3f4f6',
          margin: 0,
          minHeight: '100vh',
        }}
      >
        {children}
      </body>
    </html>
  );
}
