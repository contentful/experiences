'use client';

import type { CSSProperties, ReactNode } from 'react';

export interface TextProps {
  text?: string | null;
  children?: ReactNode;
  // Design properties, auto-filled as props.
  align?: CSSProperties['textAlign'];
  fontSize?: string;
}

export function Text({ text, children, align, fontSize = '16px' }: TextProps) {
  if (!text && !children) return null;

  const style: CSSProperties = {
    margin: 0,
    color: '#4b5563',
    lineHeight: 1.5,
    fontSize,
    textAlign: align,
  };

  return (
    <p style={style}>
      {text}
      {children}
    </p>
  );
}
