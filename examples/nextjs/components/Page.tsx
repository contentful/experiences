import type { CSSProperties, ReactNode } from 'react';

export interface PageProps {
  title?: string;
  children?: ReactNode;
}

export function Page({ children }: PageProps) {
  const wrapper: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  };
  return <main style={wrapper}>{children}</main>;
}
