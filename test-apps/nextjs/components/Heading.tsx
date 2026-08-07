'use client';

import type { CSSProperties, ReactNode } from 'react';

export type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

// Design values arrive as auto-filled props (server-resolved). `as` picks the
// tag; `align` is this design system's shorthand for `text-align`.
export interface HeadingProps {
  text?: string;
  /** Slot children, one pre-rendered node per child. */
  children?: ReactNode[];
  // Design props:
  as?: HeadingTag;
  align?: CSSProperties['textAlign'];
  fontSize?: string;
  fontWeight?: string;
}

export function Heading(props: HeadingProps) {
  console.log('[Heading] resolved props →', props);

  const { text, children, as, align, fontSize, fontWeight } = props;
  const Tag = as ?? 'h2';

  const style: CSSProperties = {
    margin: 0,
    color: '#1f2937',
    textAlign: align,
    fontSize,
    fontWeight,
  };

  return (
    <Tag style={style}>
      {text}
      {children}
    </Tag>
  );
}
