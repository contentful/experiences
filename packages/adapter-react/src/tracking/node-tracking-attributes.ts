import { getTrackingAttributes, type NodeAttribution } from '@contentful/experiences-sdk-core';

import type { ExperienceRootProps, ExperienceTrackingOptions } from './root-binding-types.js';

/**
 * Port Optimization's per-kind override mapping, adapting entry metadata to XDA scopes.
 * Undefined leaves existing caller attributes and the Web SDK's defaults in control.
 */
export function getNodeTrackingAttributes(
  attribution: NodeAttribution | undefined,
  { clickable, trackClicks, trackHovers, trackViews }: ExperienceTrackingOptions
): ExperienceRootProps {
  return {
    ...getTrackingAttributes(attribution),
    ...(clickable === undefined
      ? {}
      : { 'data-ctfl-clickable': clickable === true ? true : undefined }),
    ...(trackClicks === undefined ? {} : { 'data-ctfl-track-clicks': trackClicks }),
    ...(trackHovers === undefined ? {} : { 'data-ctfl-track-hovers': trackHovers }),
    ...(trackViews === undefined ? {} : { 'data-ctfl-track-views': trackViews }),
  };
}
