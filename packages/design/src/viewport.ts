/*
 * Viewport → CSS media-query translation. The cascade + token-resolution
 * helpers now live in core (so the resolve pipeline can pre-resolve design
 * server-side) and are re-exported here to keep this package's API unchanged.
 */

import type { ViewportDef } from '@contentful/experiences-sdk-core';

export {
  applyTokenResolver,
  getValueForViewport,
  getViewportIndex,
  resolveDesignProperties,
} from '@contentful/experiences-sdk-core';

const MEDIA_QUERY_REGEXP = /^(<|>)(\d+)(px|cm|mm|in|pt|pc)$/;

/**
 * Convert a Contentful viewport `query` string into a CSS media query.
 * Returns `undefined` for the wildcard "*" (always matches; no media query needed)
 * or for any unrecognized format.
 */
export function toCssMediaQuery(viewport: ViewportDef): string | undefined {
  const { query } = viewport;
  if (query === '*') return undefined;
  const match = query.match(MEDIA_QUERY_REGEXP);
  if (!match) return undefined;
  const [, operator, value, unit] = match;
  if (!operator || !value || !unit) return undefined;
  if (operator === '<') {
    return `(max-width: ${Number(value) - 1}${unit})`;
  }
  if (operator === '>') {
    return `(min-width: ${Number(value) + 1}${unit})`;
  }
  return undefined;
}
