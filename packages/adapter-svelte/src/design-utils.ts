/*
 * Turns the `getDesignValues()` record into a plain style object.
 * Framework-agnostic; safe to import from server code.
 *
 * The record `getDesignValues()` returns mixes real CSS-shaped design values
 * (`fontSize`, `backgroundColor`, … — bare or `cf`-prefixed depending on how
 * the customer authored them) with author-defined styling that is NOT css
 * (`variant`, `as`, `ratio`, `target`). `toCss` normalizes each key and keeps
 * it only if the result names a known CSS property (see `CSS_PROPERTIES` in
 * `@contentful/experiences-design`), so semantic keys are dropped rather than
 * leaking into a style object. It does not depend on a `cf` prefix.
 */

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
 * Convert a design record into a plain `Record<string, string | number>`
 * ready to spread into an inline `style` object or to serialize, keeping only
 * the keys that normalize to a known CSS property.
 *
 *   toCss({ fontSize: '20px', backgroundColor: '#4f39f6', variant: 'h1' })
 *   //=> { fontSize: '20px', backgroundColor: '#4f39f6' }
 *
 * Non-CSS keys (author-defined styling like `variant`) are dropped — read
 * those straight off the `getDesignValues()` record. Keys may be bare
 * (`fontSize`), `cf`-prefixed (`cfFontSize`), or kebab/snake-cased
 * (`font-size`); all normalize to `fontSize`. Non-scalar values also drop,
 * since they can't be inline-styled.
 */
export function toCss(
  design: object,
  { include, exclude }: ToCssOptions = {}
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(design)) {
    if (include && !include.includes(key)) continue;
    if (exclude?.includes(key)) continue;
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    const cssKey = toCssKey(key);
    if (!isCssProperty(cssKey)) continue;
    out[cssKey] = value;
  }
  return out;
}
