'use client';

import type { CSSProperties } from 'react';

import { useDesignValues } from '@contentful/experiences-react';

export interface ImageProps {
  src?: string;
  alt?: string | null;
}

/**
 * A plain responsive image. Any design values (e.g. a token-resolved
 * `radius`) come off `useDesignValues()`; `src`/`alt` are content props.
 */
export function Image({ src, alt }: ImageProps) {
  const design = useDesignValues();
  if (!src) return null;

  const style: CSSProperties = {
    display: 'block',
    width: '100%',
    height: 'auto',
    objectFit: 'cover',
    borderRadius: (design.radius as string) ?? undefined,
  };

  return <img src={src} alt={alt ?? ''} style={style} />;
}
