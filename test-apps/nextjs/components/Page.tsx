import type { CSSProperties, ReactNode } from 'react';

export interface PageProps {
  title?: string;
  children?: ReactNode;
}

/** Page-level template: wraps all top-level nodes in the outer page chrome. */
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
