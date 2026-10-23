import type { TrackingAttribution } from './attribution.js';

/** Automatic scope strings and disjoint private per-element occurrence identities. */
export type InteractionKey = string | symbol;

/** Resolves automatic scope or private manual occurrence attribution. */
export type ResolveScopeAttribution<TKey extends InteractionKey = string> = (
  key: TKey
) => TrackingAttribution | undefined;

/**
 * Elements are handed over per scope occurrence: an element that roots several
 * scopes is added once for each, and the elements sharing one key form a single
 * group that is reported as one view, hover or click series.
 */
export interface InteractionDetector<TKey extends InteractionKey = string> {
  start(): void;
  stop(options?: { preservePending?: boolean }): void;
  onElementAdded(element: Element, key: TKey): void;
  onElementRemoved(element: Element, key: TKey): void;
  endActive?(): Promise<void>;
}

export const isFragment = (attribution: TrackingAttribution): boolean =>
  attribution.entityKind === 'ExperienceFragment';

export const toInteractionArgs = (attribution: TrackingAttribution): TrackingAttribution => ({
  entityId: attribution.entityId,
  entityKind: attribution.entityKind,
  entityKindId: attribution.entityKindId,
  variantId: attribution.variantId,
  variantIndex: attribution.variantIndex,
  optimizationId: attribution.optimizationId,
  parentExperienceId: attribution.parentExperienceId,
  parentVariantId: attribution.parentVariantId,
  entryIds: attribution.entryIds,
});
