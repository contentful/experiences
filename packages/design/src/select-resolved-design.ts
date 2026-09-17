/*
 * Picks the design record a renderer should hand to a component.
 *
 * Shared by every framework adapter: `resolveExperience` already unwrapped the
 * design envelopes and applied the customer's `resolveToken`, so the plan's
 * `props.design` is what renders. This indirection stays because token
 * resolution is a render-time concern for adapters that let a customer supply
 * `resolveToken` on the renderer rather than at resolve time — those pass a
 * resolver here and get the unresolved ids back to diagnose.
 */

import type { DesignPropValue, ResolveToken } from '@contentful/experiences-sdk-core';
import { applyTokenResolver, resolveDesignProperties } from '@contentful/experiences-sdk-core';

export function selectResolvedDesign(
  props: { design: Record<string, unknown>; designRaw: Record<string, DesignPropValue> },
  resolveToken: ResolveToken | undefined
): { props: Record<string, unknown>; unresolved: string[] } {
  if (resolveToken === undefined) {
    return { props: props.design, unresolved: [] };
  }
  return applyTokenResolver(resolveDesignProperties(props.designRaw), resolveToken);
}
