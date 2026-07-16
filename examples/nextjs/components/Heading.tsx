'use client';

import type { CSSProperties, ReactNode } from 'react';

import { toCss, useDesignValues } from '@contentful/experiences-react';

export type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

export interface HeadingProps {
  text?: string;
  children?: ReactNode;
}

/** The design values this heading reads — passed to `useDesignValues<T>()`. */
interface HeadingDesign {
  as?: HeadingTag;
  align?: CSSProperties['textAlign'];
  fontSize?: string;
  fontWeight?: string;
}

/**
 * A heading whose tag and typography are driven entirely by design.
 * `useDesignValues<HeadingDesign>()` types the design bag (same ergonomics as
 * `useState<T>()`), so `as` / `align` read without casts. `as` is the author-
 * defined element to render (semantic, not CSS); the CSS-shaped values go
 * through `toCss`, which keeps only keys that map to real CSS properties (so
 * `as` is dropped automatically). The payload's `align` is this design
 * system's own shorthand for `text-align`, so the component maps it by name —
 * that's exactly the semantic-vs-CSS split `toCss` leaves to the component.
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
