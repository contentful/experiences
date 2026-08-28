'use client';

import type { CSSProperties } from 'react';

export interface ImageProps {
  src?: string;
  alt?: string | null;
  // Design property, auto-filled as a prop.
  radius?: string;
}

export function Image({ src, alt, radius }: ImageProps) {
  if (!src) return null;

  const style: CSSProperties = {
    display: 'block',
    width: '100%',
    height: 'auto',
    objectFit: 'cover',
    borderRadius: radius,
  };

  return <img src={src} alt={alt ?? ''} style={style} />;
}
