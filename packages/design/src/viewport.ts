/*
 * Viewport math + design-property resolution for the Experiences SDK.
 *
 * ## Cascade model
 *
 * Viewport order in the payload encodes cascade direction:
 *  - desktop-first: viewports descend by screen width (`*`, `<992px`, `<576px`)
 *  - mobile-first:  viewports ascend by screen width (`*`, `>576px`, `>992px`)
 *
 * "Active viewport" = the last-matching media query in the ordered list.
 * `getValueForViewport` walks backwards from the active viewport toward
 * viewport[0], returning the first defined value — emulating CSS cascade
 * behavior at runtime.
 *
 * ## DesignPropValue unwrapping
 *
 * v1 design properties arrive as a discriminated union:
 *  - ManualDesignValue → unwrap to its scalar `value`
 *  - DesignToken       → pass the envelope through unchanged so customer
 *                        components can resolve it themselves (token
 *                        resolution lands in the future tokens package)
 *  - ValuesByViewport  → cascade-lookup the inner ManualDesignValue/DesignToken
 *                        at the active viewport, then unwrap as above
 */

import type {
  DesignPropValue,
  DesignToken,
  ManualDesignValue,
  ValuesByViewport,
  ViewportDef,
} from '@contentful/experiences-core';

const MEDIA_QUERY_REGEXP = /(<|>)(\d+)(px|cm|mm|in|pt|pc)$/;

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

/**
 * Resolve a viewport ID to its index in the ordered viewports list. Returns 0
 * (the wildcard viewport) when the id is unknown or undefined.
 */
export function getViewportIndex(viewports: ViewportDef[], viewportId?: string): number {
  if (!viewportId) return 0;
  const index = viewports.findIndex((v) => v.id === viewportId);
  return index === -1 ? 0 : index;
}

/**
 * Unwrap a non-viewport-keyed envelope into a value the customer component
 * can consume directly. ManualDesignValue → its scalar; DesignToken → the
 * envelope passes through (customer-owned resolution).
 */
function unwrapInner(
  inner: ManualDesignValue | DesignToken | undefined,
): string | number | boolean | DesignToken | undefined {
  if (!inner) return undefined;
  if (inner.type === 'ManualDesignValue') return inner.value;
  return inner;
}

/**
 * Cascade-lookup for a `ValuesByViewport` envelope. Walks backwards from
 * `activeViewportIndex` toward viewport[0], returning the first defined value.
 */
function resolveValuesByViewport(
  bag: ValuesByViewport,
  viewports: ViewportDef[],
  activeViewportIndex: number,
): ManualDesignValue | DesignToken | undefined {
  for (let i = activeViewportIndex; i >= 0; i--) {
    const viewport = viewports[i];
    if (!viewport) continue;
    const candidate = bag.values[viewport.id];
    if (candidate !== undefined && candidate !== null) return candidate;
  }
  return undefined;
}

/**
 * Resolve a single design-property envelope to its render-time value:
 *  - ManualDesignValue → its scalar
 *  - DesignToken       → the envelope passes through (customer-owned resolution)
 *  - ValuesByViewport  → cascade-lookup against the active viewport, then
 *                        unwrap the inner Manual/Token as above
 *  - undefined         → returns undefined
 */
export function getValueForViewport(
  prop: DesignPropValue | undefined,
  viewports: ViewportDef[],
  activeViewportIndex: number,
): string | number | boolean | DesignToken | undefined {
  if (!prop) return undefined;
  if (prop.type === 'ManualDesignValue') return prop.value;
  if (prop.type === 'DesignToken') return prop;
  return unwrapInner(resolveValuesByViewport(prop, viewports, activeViewportIndex));
}

/**
 * Resolve every design-property envelope on a node into a flat record keyed
 * by property name. Customer components receive these values as plain props.
 */
export function resolveDesignProperties(
  designProperties: Record<string, DesignPropValue> | undefined,
  viewports: ViewportDef[],
  activeViewportIndex: number,
): Record<string, string | number | boolean | DesignToken> {
  const out: Record<string, string | number | boolean | DesignToken> = {};
  if (!designProperties) return out;
  for (const [key, prop] of Object.entries(designProperties)) {
    const value = getValueForViewport(prop, viewports, activeViewportIndex);
    if (value !== undefined) out[key] = value;
  }
  return out;
}
