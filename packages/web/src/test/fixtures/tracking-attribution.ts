import type { TrackingAttribution } from '../../tracking/attribution.js';
export const EXPERIENCE: TrackingAttribution = { entityId: 'landing', entityKind: 'Experience' };
export const FRAGMENT: TrackingAttribution = {
  entityId: 'hero',
  entityKind: 'ExperienceFragment',
  entityKindId: 'hero-component',
  parentExperienceId: 'landing',
  parentVariantId: 'root-variant',
  variantIndex: 1,
};
