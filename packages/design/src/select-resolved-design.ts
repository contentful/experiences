/*
 * Picks the design record a renderer should use for the active viewport.
 *
 * Shared by every framework adapter: the choice between "trust the server's
 * pre-resolved values" and "recompute the cascade client-side" is a property of
 * the IR, not of any one framework.
 */

import type { DesignPropValue, ResolveToken, ViewportDef } from '@contentful/experiences-sdk-core';
import { applyTokenResolver, resolveDesignProperties } from '@contentful/experiences-sdk-core';

// Use the server-resolved `props.design` when the active viewport matches the
// fallback; otherwise recompute the cascade from raw `props.designRaw`.
export function selectResolvedDesign(
  props: { design: Record<string, unknown>; designRaw: Record<string, DesignPropValue> },
  viewports: ViewportDef[],
  activeViewportIndex: number,
  fallbackViewportIndex: number,
  resolveToken: ResolveToken | undefined
): { props: Record<string, unknown>; unresolved: string[] } {
  if (activeViewportIndex === fallbackViewportIndex) {
    return { props: props.design, unresolved: [] };
  }
  const resolvedDesign = resolveDesignProperties(props.designRaw, viewports, activeViewportIndex);
  return applyTokenResolver(resolvedDesign, resolveToken);
}
