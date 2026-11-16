import type { TrackingAttribution } from './attribution.js';
import { readAutomaticKeys, readManualViewKey } from './automatic-attribution.js';
import { INTERACTION_ATTRIBUTES } from './interaction-controls.js';
import {
  type InteractionDetector,
  type InteractionKey,
  type ResolveScopeAttribution,
  toInteractionArgs,
} from './interaction-detector.js';
import type { EntryInteraction, EntryViewInteractionElementOptions } from './types.js';

export const MANUAL_VIEWS_ATTRIBUTE = 'data-ctfl-manual-views';

export interface ElementTrackingOverride {
  enabled: boolean;
  options?: EntryViewInteractionElementOptions;
  key: symbol;
}

export interface ElementTrackingEntry {
  type: EntryInteraction;
  detector: InteractionDetector<InteractionKey>;
  auto: boolean;
  running: boolean;
  overrides: Map<Element, ElementTrackingOverride>;
  observed: Map<Element, Map<InteractionKey, string>>;
}

const entityKey = (attribution: TrackingAttribution): string =>
  JSON.stringify(toInteractionArgs(attribution));

/** Reconciles one element's policy and occurrence membership without owning its lifetime. */
export function reconcileTrackedElement(
  entry: ElementTrackingEntry,
  element: Element,
  resolveKeyAttribution: ResolveScopeAttribution<InteractionKey>
): void {
  if (!entry.running) return;
  const next = new Map<InteractionKey, string>();
  const override = entry.overrides.get(element);
  const manualViews =
    !override &&
    entry.type === 'views' &&
    element
      .closest(`[${MANUAL_VIEWS_ATTRIBUTE}]`)
      ?.getAttribute(MANUAL_VIEWS_ATTRIBUTE)
      ?.trim()
      .toLowerCase() === 'true';
  const attr = element.getAttribute(INTERACTION_ATTRIBUTES[entry.type])?.trim().toLowerCase();
  const enabled =
    override?.enabled ??
    (manualViews || (attr === 'true' ? true : attr === 'false' ? false : entry.auto));
  if (enabled && element.isConnected) {
    const manual = override?.enabled && resolveKeyAttribution(override.key);
    let keys: InteractionKey[];
    if (manual) keys = [override.key];
    else if (manualViews) {
      const selected = readManualViewKey(element);
      keys = selected ? [selected] : [];
    } else keys = readAutomaticKeys(element);
    for (const key of keys) {
      const attribution = resolveKeyAttribution(key);
      if (attribution) next.set(key, entityKey(attribution));
    }
  }
  const current = entry.observed.get(element) ?? new Map<InteractionKey, string>();
  for (const [key, entity] of current) {
    if (next.get(key) !== entity)
      entry.detector.onElementRemoved(element, key, {
        finalize: !element.isConnected || enabled,
      });
  }
  for (const [key, entity] of next) {
    if (current.get(key) !== entity) entry.detector.onElementAdded(element, key);
  }
  if (next.size) entry.observed.set(element, next);
  else entry.observed.delete(element);
}
