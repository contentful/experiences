import type { DesignPropValue, ResolveToken, ViewportDef } from '@contentful/experiences-sdk-core';
import {
  applyTokenResolver,
  isCssProperty,
  resolveDesignProperties,
  toCssKey,
} from '@contentful/experiences-design';

/**
 * Choose the resolved design values for a node. When the server pre-resolved
 * design (`designResolved` present) and the active viewport matches the
 * fallback the server used, the precomputed values are correct as-is — use them
 * and skip the cascade. Otherwise (no pre-resolution, or the client has moved
 * to a different viewport) recompute from the raw design properties.
 */
export function selectResolvedDesign(
  props: { design: Record<string, DesignPropValue>; designResolved?: Record<string, unknown> },
  viewports: ViewportDef[],
  activeViewportIndex: number,
  fallbackViewportIndex: number | undefined,
  resolveToken: ResolveToken | undefined
): { props: Record<string, unknown>; unresolved: string[] } {
  if (props.designResolved !== undefined && activeViewportIndex === fallbackViewportIndex) {
    return { props: props.designResolved, unresolved: [] };
  }
  const resolvedDesign = resolveDesignProperties(props.design, viewports, activeViewportIndex);
  return applyTokenResolver(resolvedDesign, resolveToken);
}

export interface ToCssOptions {
  /** Keys to skip, matched against the original record key. */
  exclude?: string[];
  /** When set, only these keys pass through (still whitelist-filtered). */
  include?: string[];
}

/**
 * Convert a design record into a plain style object, keeping only keys that
 * normalize to a known CSS property. Non-CSS keys (`variant`, `as`, …) and
 * non-scalar values are dropped; read those off the `getDesignValues()`
 * record directly.
 *
 *   toCss({ fontSize: '20px', variant: 'h1' }) //=> { fontSize: '20px' }
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
