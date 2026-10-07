/* Design-property and token resolution for the core render-plan builder. */

import type { DesignPropValue, DesignToken, ResolveToken } from './types.js';

/**
 * Resolve every design property on a node into a record keyed by name.
 */
export function resolveDesignProperties(
  designProperties: Record<string, DesignPropValue> | undefined
): Record<string, string | number | boolean | DesignToken> {
  const out: Record<string, string | number | boolean | DesignToken> = {};
  if (!designProperties) return out;
  for (const [key, prop] of Object.entries(designProperties)) {
    out[key] = prop.type === 'ManualDesignValue' ? prop.value : prop;
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
