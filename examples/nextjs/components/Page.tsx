import type { CSSProperties, ReactNode } from 'react';

export interface PageProps {
  title?: string;
  children?: ReactNode;
}

export function Page({ title, children }: PageProps) {
  const wrapper: CSSProperties = {
    maxWidth: 720,
    margin: '40px auto',
    padding: 32,
    background: '#ffffff',
    borderRadius: 16,
    border: '1px solid #e5e7eb',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  };
  const titleStyle: CSSProperties = {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#6b7280',
    margin: 0,
  };
  return (
    <main style={wrapper}>
      {title ? <p style={titleStyle}>{title}</p> : null}
      {children}
    </main>
  );
}
