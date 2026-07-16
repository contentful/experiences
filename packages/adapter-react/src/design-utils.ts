/*
 * Turns the `useDesignValues()` record into a ready-to-spread CSSProperties
 * object. Pure utility — safe to import from a server component; no React
 * hooks, no DOM.
 *
 * The record `useDesignValues()` returns mixes real CSS-shaped design values
 * (`fontSize`, `backgroundColor`, … — bare or `cf`-prefixed depending on how
 * the customer authored them) with author-defined styling that is NOT css
 * (`variant`, `as`, `ratio`, `target`). `toCss` normalizes each key and keeps
 * it only if the result names a known CSS property (see `CSS_PROPERTIES` in
 * `@contentful/experiences-design`), so semantic keys are dropped rather than
 * leaking into a style object. It does not depend on a `cf` prefix.
 */

import type { CSSProperties } from 'react';

import { isCssProperty, toCssKey } from '@contentful/experiences-design';

export interface ToCssOptions {
  /**
   * Keys to skip even if they ARE valid CSS — matched against the original
   * record key. Useful when a component drives one CSS prop itself.
   */
  exclude?: string[];
  /**
   * When set, only these keys pass through (still subject to the CSS-property
   * whitelist) — matched against the original record key.
   */
  include?: string[];
}

/**
 * Convert a design record into a CSSProperties-shaped object, keeping only
 * the keys that normalize to a known CSS property.
 *
 *   toCss({ fontSize: '20px', backgroundColor: '#4f39f6', variant: 'h1' })
 *   //=> { fontSize: '20px', backgroundColor: '#4f39f6' }
 *
 * Non-CSS keys (author-defined styling like `variant`) are dropped — read
 * those straight off the `useDesignValues()` record. Keys may be bare
 * (`fontSize`), `cf`-prefixed (`cfFontSize`), or kebab/snake-cased
 * (`font-size`); all normalize to `fontSize`.
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
