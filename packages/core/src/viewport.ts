/*
 * Viewport math + design-property resolution. Lives in core (not design) so the
 * resolve pipeline can pre-resolve design props server-side; the design package
 * re-exports these, so its public API is unchanged.
 *
 * Viewport order encodes cascade direction (desktop-first descends by width,
 * mobile-first ascends). The "active viewport" is the last-matching media query;
 * `getValueForViewport` walks backwards from it to viewport[0] and returns the
 * first defined value, matching CSS cascade behavior.
 */

import type {
  DesignPropValue,
  DesignToken,
  ManualDesignValue,
  ResolveToken,
  ValuesByViewport,
  ViewportDef,
} from './types.js';

/** Viewport id → index. Returns 0 (the wildcard viewport) when unknown. */
export function getViewportIndex(viewports: ViewportDef[], viewportId?: string): number {
  if (!viewportId) return 0;
  const index = viewports.findIndex((v) => v.id === viewportId);
  return index === -1 ? 0 : index;
}

// ManualDesignValue → its scalar; DesignToken → passed through (resolved later).
function unwrapInner(
  inner: ManualDesignValue | DesignToken | undefined
): string | number | boolean | DesignToken | undefined {
  if (!inner) return undefined;
  if (inner.type === 'ManualDesignValue') return inner.value;
  return inner;
}

// Cascade-lookup: walk back from activeViewportIndex to viewport[0], first defined wins.
function resolveValuesByViewport(
  valuesByViewport: ValuesByViewport,
  viewports: ViewportDef[],
  activeViewportIndex: number
): ManualDesignValue | DesignToken | undefined {
  for (let i = activeViewportIndex; i >= 0; i--) {
    const viewport = viewports[i];
    if (!viewport) continue;
    const candidate = valuesByViewport.values[viewport.id];
    if (candidate !== undefined && candidate !== null) return candidate;
  }
  return undefined;
}

/** Resolve one design property to its render-time value (cascade + unwrap). */
export function getValueForViewport(
  prop: DesignPropValue | undefined,
  viewports: ViewportDef[],
  activeViewportIndex: number
): string | number | boolean | DesignToken | undefined {
  if (!prop) return undefined;
  if (prop.type === 'ManualDesignValue') return prop.value;
  if (prop.type === 'DesignToken') return prop;
  return unwrapInner(resolveValuesByViewport(prop, viewports, activeViewportIndex));
}

/** Resolve every design property on a node into a flat record keyed by name. */
export function resolveDesignProperties(
  designProperties: Record<string, DesignPropValue> | undefined,
  viewports: ViewportDef[],
  activeViewportIndex: number
): Record<string, string | number | boolean | DesignToken> {
  const out: Record<string, string | number | boolean | DesignToken> = {};
  if (!designProperties) return out;
  for (const [key, prop] of Object.entries(designProperties)) {
    const value = getValueForViewport(prop, viewports, activeViewportIndex);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * Resolve `DesignToken` values via `resolveToken`; scalars pass through.
 * Keys that don't resolve — no `resolveToken` configured, or the resolver
 * returns `undefined` for that particular token — pass through as the raw
 * `DesignToken` and their id is collected in `unresolved` for the caller to
 * warn/diagnose (see `warnUnresolvedTokens` in `resolve-experience.ts`, which
 * already dedupes per `resolveExperience()` call, so this function carries
 * no warn-once state of its own).
 */
export function applyTokenResolver(
  props: Record<string, string | number | boolean | DesignToken>,
  resolveToken?: ResolveToken
): { props: Record<string, unknown>; unresolved: string[] } {
  const out: Record<string, unknown> = {};
  const unresolved: string[] = [];
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === 'object' && value !== null && value.type === 'DesignToken') {
      const resolved = resolveToken?.(value);
      if (resolved === undefined) {
        out[key] = value;
        unresolved.push(value.value);
        continue;
      }
      out[key] = resolved;
      continue;
    }
    out[key] = value;
  }
  return { props: out, unresolved };
}
