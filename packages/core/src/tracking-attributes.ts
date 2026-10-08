/**
 * Lists the occurrence keys of the scopes an element roots, space-separated.
 * Put it on the outermost element a node renders. The keys are opaque: they
 * resolve through `plan.attribution.scopes`, so no attribution lives in the DOM.
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
}

/**
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
  attribution: { roots: ReadonlyArray<{ key: string }> } | undefined
): TrackingAttributes {
  const keys = attribution?.roots.map((scope) => scope.key) ?? [];
  return keys.length > 0 ? { [TRACKING_SCOPES_ATTRIBUTE]: keys.join(' ') } : {};
}
