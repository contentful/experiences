import type { TrackingAttribution } from './attribution.js';
import { toInteractionArgs, type InteractionKey } from './interaction-detector.js';
import { TRACKING_SCOPES_ATTRIBUTE } from '../tracking-attributes.js';

export const TRACKING_ATTRIBUTION_ATTRIBUTE = 'data-ctfl-attribution';

type AutomaticKey = Extract<InteractionKey, object>;
const boundaries = new WeakMap<Element, { raw: string; keys: Map<string, AutomaticKey> }>();
const manualViews = new WeakMap<Element, { signature: string; key: AutomaticKey }>();
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** DOM metadata is untrusted; copy only valid event fields into each occurrence. */
function parseAttribution(value: unknown): TrackingAttribution | undefined {
  if (!isRecord(value) || typeof value.entityId !== 'string' || !value.entityId.trim())
    return undefined;
  if (value.entityKind !== 'Experience' && value.entityKind !== 'ExperienceFragment')
    return undefined;
  const attribution: TrackingAttribution = {
    entityId: value.entityId,
    entityKind: value.entityKind,
  };
  for (const field of [
    'entityKindId',
    'variantId',
    'optimizationId',
    'parentExperienceId',
    'parentVariantId',
  ] as const) {
    if (value[field] !== undefined) {
      if (typeof value[field] !== 'string') return undefined;
      attribution[field] = value[field];
    }
  }
  if (value.variantIndex !== undefined) {
    if (!Number.isInteger(value.variantIndex) || (value.variantIndex as number) < 0)
      return undefined;
    attribution.variantIndex = value.variantIndex as number;
  }
  if (value.entryIds !== undefined) {
    if (!Array.isArray(value.entryIds) || !value.entryIds.every((id) => typeof id === 'string'))
      return undefined;
    attribution.entryIds = value.entryIds;
  }
  return attribution;
}

/** One weak cache entry per DOM boundary; replacing metadata retires its old keys. */
function readBoundaryKeys(element: Element): Map<string, AutomaticKey> | undefined {
  const boundary = element.closest(`[${TRACKING_ATTRIBUTION_ATTRIBUTE}]`);
  if (!boundary) return undefined;
  const raw = boundary.getAttribute(TRACKING_ATTRIBUTION_ATTRIBUTE)!;
  let cached = boundaries.get(boundary);
  if (cached?.raw !== raw) {
    const keys = new Map<string, AutomaticKey>();
    try {
      const metadata: unknown = JSON.parse(raw);
      if (isRecord(metadata) && isRecord(metadata.scopes)) {
        for (const [localKey, value] of Object.entries(metadata.scopes)) {
          const attribution = parseAttribution(value);
          if (attribution) keys.set(localKey, { localKey, attribution });
        }
      }
    } catch {
      // Malformed or partially updated DOM metadata leaves this boundary untracked.
    }
    cached = { raw, keys };
    boundaries.set(boundary, cached);
  }
  return cached.keys;
}

export function readAutomaticKeys(element: Element): AutomaticKey[] {
  const keys = readBoundaryKeys(element);
  return (element.getAttribute(TRACKING_SCOPES_ATTRIBUTE) ?? '')
    .split(/\s+/)
    .flatMap((key) => keys?.get(key) ?? []);
}

/** Each marked root measures only its final raw scope, independently of sibling roots. */
export function readManualViewKey(element: Element): AutomaticKey | undefined {
  const localKey = element.getAttribute(TRACKING_SCOPES_ATTRIBUTE)?.trim().split(/\s+/).at(-1);
  const selected = localKey ? readBoundaryKeys(element)?.get(localKey) : undefined;
  if (!selected) return undefined;
  const signature = JSON.stringify(toInteractionArgs(selected.attribution));
  let cached = manualViews.get(element);
  if (cached?.signature !== signature) {
    cached = { signature, key: { ...selected } };
    manualViews.set(element, cached);
  }
  return cached.key;
}
