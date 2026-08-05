'use client';

import type { CSSProperties, ReactNode } from 'react';

export type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

/**
 * Design values arrive as ordinary props (auto-filled by the SDK after
 * server-side resolution), so this reads them directly instead of calling
 * `useDesignValues()`. `as` picks the tag (semantic); `align` is this design
 * system's shorthand for `text-align`; `fontSize`/`fontWeight` are CSS-shaped.
 */
export interface HeadingProps {
  text?: string;
  children?: ReactNode;
  // Design props (auto-filled, already resolved):
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
