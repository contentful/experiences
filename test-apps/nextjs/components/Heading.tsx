'use client';

import type { CSSProperties, ReactNode } from 'react';

import { toCss, useDesignValues } from '@contentful/experiences-react';

export type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

export interface HeadingProps {
  text?: string;
  children?: ReactNode;
}

interface HeadingDesign {
  as?: HeadingTag;
  align?: CSSProperties['textAlign'];
  fontSize?: string;
  fontWeight?: string;
}

/**
 * `useDesignValues<HeadingDesign>()` types the design bag (like `useState<T>()`).
 * `as` picks the tag (semantic); `toCss` keeps the CSS-shaped keys and drops
 * `as`; `align` is this design system's shorthand for `text-align`, mapped by name.
 */
export function Heading({ text, children }: HeadingProps) {
  const design = useDesignValues<HeadingDesign>();
  const Tag = design.as ?? 'h2';

  const style: CSSProperties = {
    margin: 0,
    color: '#1f2937',
    textAlign: design.align,
    ...toCss(design),
  };

  return (
    <Tag style={style}>
      {text}
      {children}
    </Tag>
  );
}
