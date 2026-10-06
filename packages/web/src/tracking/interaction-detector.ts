import type { TrackingAttribution } from './attribution.js';

export type ResolveElementAttribution = (element: Element) => TrackingAttribution | undefined;

export interface InteractionDetector {
  start(): void;
  stop(): void;
  onElementAdded(element: Element): void;
  onElementRemoved(element: Element): void;
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
