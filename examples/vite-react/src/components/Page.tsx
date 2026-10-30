import type { CSSProperties, ReactNode } from 'react';

export interface PageProps {
  title?: string;
  // The template's `content` slot arrives as a same-named prop, exactly like a
  // component's slots — there is no `children` special case.
  content?: ReactNode[];
}

export function Page({ content }: PageProps) {
  const wrapper: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  };
  return <main style={wrapper}>{content}</main>;
}
