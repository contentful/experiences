/*
 * Port of adapter-svelte/src/design-utils.ts. Deliberately not hoisted into
 * `@contentful/experiences-design`: the React variant returns `CSSProperties`
 * and keeps any non-null value, while this one is scalar-only and returns a
 * plain record. The plain record is what Angular's `[ngStyle]` wants.
 */

import { isCssProperty, toCssKey } from '@contentful/experiences-design';

export interface ToCssOptions {
  /** Keys to skip, matched against the original record key. */
  exclude?: string[];
  /** When set, only these keys pass through (still whitelist-filtered). */
  include?: string[];
}

/**
 * Convert a design record into a plain style object, keeping only keys that
 * normalize to a known CSS property. Non-CSS keys (`variant`, `as`, …) and
 * non-scalar values are dropped; read those off the `injectDesignValues()`
 * record directly.
 *
 *   toCss({ fontSize: '20px', variant: 'h1' }) //=> { fontSize: '20px' }
 *
 * The camelCase keys it emits are what `[ngStyle]` accepts:
 *
 *   readonly design = injectDesignValues();
 *   protected readonly style = computed(() => toCss(this.design()));
 *   // template: <div [ngStyle]="style()">
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
