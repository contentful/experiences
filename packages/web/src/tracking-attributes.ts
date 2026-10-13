/*
 * The attribute contract is pure string functions and lives in core so every
 * framework adapter can stamp it without depending on the Web SDK. This subpath
 * stays as a re-export for anyone already importing it from here.
 */
export {
  getTrackingAttributes,
  TRACKING_CLICKABLE_ATTRIBUTE,
  TRACKING_SCOPES_ATTRIBUTE,
} from '@contentful/experiences-sdk-core';
export type { TrackingAttributes } from '@contentful/experiences-sdk-core';
