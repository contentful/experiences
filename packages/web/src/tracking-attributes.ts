/** Holds a tracked node's `nodeId`. Put it on the outermost element the node renders. */
export const TRACKING_NODE_ATTRIBUTE = 'data-ctfl-node-id';

/**
 * Opts an element into click tracking when it is not otherwise interactive.
 * Links, buttons, form controls, `[role="button"]`, `[role="link"]`, and
 * elements with an `onclick` handler count already. Set it to `"true"`.
 */
export const TRACKING_CLICKABLE_ATTRIBUTE = 'data-ctfl-clickable';

export interface TrackingAttributes {
  [TRACKING_NODE_ATTRIBUTE]?: string;
}

/**
 * Attributes to spread onto a tracked node's outermost element. Returns `{}`
 * when there is no id: such a node cannot be tracked, and nothing is rendered
 * for it.
 *
 * @example
 * ```tsx
 * <section {...getTrackingAttributes(nodeId)}>…</section>
 * ```
 */
export function getTrackingAttributes(nodeId: string | undefined): TrackingAttributes {
  return nodeId ? { [TRACKING_NODE_ATTRIBUTE]: nodeId } : {};
}
