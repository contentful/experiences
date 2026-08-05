'use client';

import type { CSSProperties } from 'react';

export interface ImageProps {
  src?: string;
  alt?: string | null;
  // Design props (auto-filled, server-resolved):
  radius?: string;
}

export function Image(props: ImageProps) {
  console.log('[Image] resolved props →', props);

  const { src, alt, radius } = props;
  if (!src) return null;

  const style: CSSProperties = {
    display: 'block',
    width: '100%',
    height: 'auto',
    objectFit: 'cover',
    borderRadius: radius ?? undefined,
  };

  return <img src={src} alt={alt ?? ''} style={style} />;
}
