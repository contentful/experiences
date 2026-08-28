'use client';

import type { CSSProperties, ReactNode } from 'react';

export type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

export interface HeadingProps {
  text?: string;
  children?: ReactNode;
  // Design properties, auto-filled as props — already cascaded to the active
  // viewport and token-resolved by the time they arrive.
  as?: HeadingTag;
  align?: CSSProperties['textAlign'];
  fontSize?: string;
  fontWeight?: string;
}

/**
 * The recommended way to style a component: declare the design properties you
 * consume as props and read them by name. They arrive resolved, so `as` (a
 * semantic key) picks the tag and the CSS-shaped keys go straight into `style`
 * with no conversion step and no casts.
 *
 * `align` is this design system's shorthand for `text-align` — a design
 * property name doesn't have to match a CSS property name, you map it.
 */
export function Heading({ text, children, as = 'h2', align, fontSize, fontWeight }: HeadingProps) {
  const Tag = as;

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
