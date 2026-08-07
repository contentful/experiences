'use client';

import type { CSSProperties, ReactNode } from 'react';

import { useDesignValues } from '@contentful/experiences-react';

export interface TextProps {
  text?: string | null;
  /** Slot children, one pre-rendered node per child. */
  children?: ReactNode[];
}

export function Text({ text, children }: TextProps) {
  const design = useDesignValues();
  // Check `.length`, not truthiness — an empty slot is `[]`, which is truthy.
  if (!text && !children?.length) return null;

  const style: CSSProperties = {
    margin: 0,
    color: '#4b5563',
    lineHeight: 1.5,
    fontSize: (design.fontSize as string) ?? '16px',
    textAlign: (design.align as CSSProperties['textAlign']) ?? undefined,
  };

  return (
    <p style={style}>
      {text}
      {children}
    </p>
  );
}
