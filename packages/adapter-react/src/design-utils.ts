import type { CSSProperties } from 'react';

import { isCssProperty, toCssKey } from '@contentful/experiences-design';

export interface ToCssOptions {
  /** Keys to skip, matched against the original record key. */
  exclude?: string[];
  /** When set, only these keys pass through (still whitelist-filtered). */
  include?: string[];
}

/**
 * Convert a design record into a `CSSProperties` object, keeping only keys
 * that normalize to a known CSS property. Non-CSS keys (`variant`, `as`, …)
 * are dropped; read those off the `useDesignValues()` record directly.
 *
 *   toCss({ fontSize: '20px', variant: 'h1' }) //=> { fontSize: '20px' }
 */
export function toCss(design: object, { include, exclude }: ToCssOptions = {}): CSSProperties {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(design)) {
    if (include && !include.includes(key)) continue;
    if (exclude?.includes(key)) continue;
    if (value === undefined || value === null) continue;
    const cssKey = toCssKey(key);
    if (!isCssProperty(cssKey)) continue;
    out[cssKey] = value;
  }
  return out as CSSProperties;
}
