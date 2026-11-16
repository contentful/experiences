import { Suspense, type ReactNode } from 'react';

import { ConsentPanel } from '@/components/ConsentPanel';
import { PreviewExperiencesRoot } from '@/components/LivePreviewExperience';

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
        <Suspense fallback={children}>
          <PreviewExperiencesRoot
            spaceId={process.env.SPACE_ID ?? ''}
            environmentId={process.env.ENVIRONMENT_ID ?? 'master'}
            accessToken={process.env.CDA_TOKEN ?? ''}
            previewToken={process.env.CPA_TOKEN}
          >
            {children}
            <ConsentPanel />
          </PreviewExperiencesRoot>
        </Suspense>
      </body>
    </html>
  );
}
