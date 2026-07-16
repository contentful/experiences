import type { CSSProperties, ReactNode } from 'react';

export interface PageProps {
  title?: string;
  children?: ReactNode;
}

/**
 * The page-level template. It wraps every top-level Experience node as
 * `children` and provides the outer page chrome (centered column, vertical
 * rhythm between sections). `title` is an optional editorial default from the
 * Config — this payload's `page` template carries no props, so it's unused
 * here but kept for the general case.
 */
export function Page({ children }: PageProps) {
  const wrapper: CSSProperties = {
    maxWidth: 1024,
    margin: '0 auto',
    padding: '48px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 48,
  };
  return <main style={wrapper}>{children}</main>;
}
