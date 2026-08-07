'use client';

import type { CSSProperties, ReactNode } from 'react';

export interface TextProps {
  text?: string | null;
  /** Slot children, one pre-rendered node per child. */
  children?: ReactNode[];
  // Design props (auto-filled, server-resolved):
  fontSize?: string;
  align?: CSSProperties['textAlign'];
}

export function Text(props: TextProps) {
  console.log('[Text] resolved props →', props);

  const { text, children, fontSize, align } = props;
  // Check `.length`, not truthiness — an empty slot is `[]`, which is truthy.
  if (!text && !children?.length) return null;

  const style: CSSProperties = {
    margin: 0,
    color: '#4b5563',
    lineHeight: 1.5,
    fontSize: fontSize ?? '16px',
    textAlign: align ?? undefined,
  };

  return (
    <p style={style}>
      {text}
      {children}
    </p>
  );
}
