import type { ClickBuilderArgs } from '@contentful/experiences-client';

export type TrackedEntityKind = Extract<ClickBuilderArgs['entityKind'], 'Experience' | 'Fragment'>;

export type TrackingAttribution = Pick<
  ClickBuilderArgs,
  | 'entityId'
  | 'entityKindId'
  | 'variantId'
  | 'variantIndex'
  | 'optimizationId'
  | 'parentExperienceId'
  | 'entryIds'
> & { entityKind: TrackedEntityKind };

const TRACKED_ENTITY_KINDS: ReadonlySet<string> = new Set<TrackedEntityKind>([
  'Experience',
  'Fragment',
]);

export const isTrackedEntity = (
  attribution: TrackingAttribution | undefined
): attribution is TrackingAttribution =>
  attribution !== undefined && TRACKED_ENTITY_KINDS.has(attribution.entityKind);
