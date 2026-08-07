import type { CSSProperties, ReactNode } from 'react';

// Page-level template. A server component, so its prop log lands in the server
// terminal — confirming design resolves server-side before hydration.
export interface PageProps {
  title?: string;
  children?: ReactNode;
  // Design props (auto-filled, server-resolved):
  backgroundColor?: string;
  color?: string;
}

/** Page-level Experience Template: wraps all top-level nodes in the outer page chrome. */
export function Page(props: PageProps) {
  console.log('[Page] resolved props →', { ...props, children: '<omitted>' });

  const { children, backgroundColor, color } = props;

  const wrapper: CSSProperties = {
    maxWidth: 1024,
    margin: '0 auto',
    padding: '48px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 48,
    backgroundColor,
    color,
  };
  return <main style={wrapper}>{children}</main>;
}
