import type { PlanAttribution } from './types.js';

/**
 * Lists the occurrence keys of the scopes an element roots, space-separated.
 * Put it on the outermost element a node renders. The keys are opaque: they
 * resolve through the plan attribution stamped on their nearest container.
 */
export const TRACKING_SCOPES_ATTRIBUTE = 'data-ctfl-scopes';

/**
 * Opts an element into click tracking when it is not otherwise interactive.
 * Links, buttons, form controls, `[role="button"]`, `[role="link"]`, and
 * elements with an `onclick` handler count already. Set it to `"true"`.
 */
export const TRACKING_CLICKABLE_ATTRIBUTE = 'data-ctfl-clickable';

export interface TrackingAttributes {
  [TRACKING_SCOPES_ATTRIBUTE]?: string;
  'data-ctfl-attribution'?: string;
}

/**
 * Spread plan attribution onto each rendered Experience container, and node
 * attribution onto its outermost elements. Each container is an independent
 * occurrence, including repeated renders of the same plan.
 *
 * Attributes to spread onto a tracked node's outermost element, built from the
 * `attribution` a component context accessor returns. Returns `{}` when the
 * node roots no scope: nothing is rendered for it, so a node in the middle of a
 * scope, or one without attribution, is left alone.
 *
 * @example
 * ```tsx
 * const contentful = useContentfulComponent();
 * <section {...getTrackingAttributes(contentful?.attribution)}>…</section>
 * ```
 */
export function getTrackingAttributes(
  attribution: PlanAttribution | { roots: ReadonlyArray<{ key: string }> } | undefined
): TrackingAttributes {
  if (attribution && !('roots' in attribution)) {
    // Consumer integration: serialize event attribution only, once per container.
    // Do not duplicate each key inside its record or expose additional caller fields.
    const scopes = Object.fromEntries(
      Object.entries(attribution.scopes).map(([key, scope]) => [
        key,
        {
          entityId: scope.entityId,
          entityKind: scope.entityKind,
          entityKindId: scope.entityKindId,
          variantId: scope.variantId,
          variantIndex: scope.variantIndex,
          optimizationId: scope.optimizationId,
          parentExperienceId: scope.parentExperienceId,
          parentVariantId: scope.parentVariantId,
          entryIds: scope.entryIds,
        },
      ])
    );
    return { 'data-ctfl-attribution': JSON.stringify({ scopes }) };
  }
  const keys = attribution?.roots.map((scope) => scope.key) ?? [];
  return keys.length > 0 ? { [TRACKING_SCOPES_ATTRIBUTE]: keys.join(' ') } : {};
}
