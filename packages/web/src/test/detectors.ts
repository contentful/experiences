import type { TrackingAttribution } from '../tracking/attribution.js';

/** One scope occurrence key per element, so a test can treat an element as its own occurrence. */
const keys = new Map<Element, string>();
export const keyOf = (element: Element): string => {
  let key = keys.get(element);
  if (!key) keys.set(element, (key = `s${keys.size}`));
  return key;
};

/** Resolves attribution from a per-test element → attribution map, through each element's key. */
export const lookup = (map: Map<Element, TrackingAttribution>) => (key: string) => {
  for (const [element, attribution] of map) if (keyOf(element) === key) return attribution;
  return undefined;
};

export const click = (target: Node): void => {
  target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};

export function resetDetectorKeys(): void {
  keys.clear();
}
