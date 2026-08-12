import type { CSSProperties, ReactNode } from 'react';

// Page-level template. A server component, so its prop log lands in the server
// terminal — confirming design resolves server-side before hydration.
export interface PageProps {
  title?: string;
  // The template's `content` slot arrives as a same-named prop, exactly like a
  // component's slots — there is no `children` special case.
  content?: ReactNode[];
  // Design props (auto-filled, server-resolved):
  backgroundColor?: string;
  color?: string;
}

/** Coded Experience Template: an ordinary node that wraps its slot children in the page chrome. */
export function Page(props: PageProps) {
  console.log('[Page] resolved props →', { ...props, content: '<omitted>' });

  const { content, backgroundColor, color } = props;

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
  return <main style={wrapper}>{content}</main>;
}
