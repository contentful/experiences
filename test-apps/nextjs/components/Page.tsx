import type { CSSProperties, ReactNode } from 'react';

/**
 * Page-level template: wraps all top-level nodes in the outer page chrome.
 * Design values arrive as ordinary props (auto-filled by the SDK after
 * server-side resolution). This is a server component, so its prop log lands
 * in the server terminal — handy for confirming resolution happens on the
 * server before hydration.
 */
export interface PageProps {
  title?: string;
  children?: ReactNode;
  // Design props (auto-filled, already resolved):
  backgroundColor?: string;
  color?: string;
}

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
