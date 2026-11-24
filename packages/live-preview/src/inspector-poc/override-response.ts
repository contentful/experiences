import type { ExperiencePayload } from '@contentful/experiences-sdk-core';
import { addCapturedSourceMap, type InspectorCapture } from './source-map.js';

/** Temporary, scoped development-only metadata override. Never changes delivered content. */
export function overrideInspectorResponse(
  payload: ExperiencePayload,
  request: { spaceId: string; environmentId: string; sourceMap?: boolean },
  capture: InspectorCapture | undefined
): ExperiencePayload {
  if (
    !capture ||
    request.sourceMap !== true ||
    request.spaceId !== capture.spaceId ||
    request.environmentId !== capture.environmentId
  )
    return payload;
  try {
    if (process.env.NODE_ENV !== 'development') return payload;
  } catch {
    return payload;
  }
  return addCapturedSourceMap(payload, capture);
}
