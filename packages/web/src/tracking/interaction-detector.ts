import type { TrackingAttribution } from './attribution.js';

/** Resolves a scope occurrence key, as listed on `data-ctfl-scopes`, to its attribution. */
export type ResolveScopeAttribution = (key: string) => TrackingAttribution | undefined;

/**
 * Elements are handed over per scope occurrence: an element that roots several
 * scopes is added once for each, and the elements sharing one key form a single
 * group that is reported as one view, hover or click series.
 */
export interface InteractionDetector {
  start(): void;
  stop(): void;
  onElementAdded(element: Element, key: string): void;
  onElementRemoved(element: Element, key: string): void;
  endActive?(): Promise<void>;
}

export const isFragment = (attribution: TrackingAttribution): boolean =>
  attribution.entityKind === 'Fragment';

export const toInteractionArgs = (attribution: TrackingAttribution): TrackingAttribution => ({
  entityId: attribution.entityId,
  entityKind: attribution.entityKind,
  entityKindId: attribution.entityKindId,
  variantId: attribution.variantId,
  variantIndex: attribution.variantIndex,
  optimizationId: attribution.optimizationId,
  parentExperienceId: attribution.parentExperienceId,
  entryIds: attribution.entryIds,
});
