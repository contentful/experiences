import type { ExperiencePayload } from '@contentful/experiences-sdk-core';
import { addFlinklyComponentSourceMap } from './flinkly-repeated-sections.js';

/** Development-only source paths for the shared Flinkly inspector fixture. */
export function overrideInspectorResponse(
  payload: ExperiencePayload,
  request: { spaceId: string; environmentId: string; sourceMap?: boolean }
): ExperiencePayload {
  if (
    !request.sourceMap ||
    request.spaceId !== '3ig419rcwm58' ||
    request.environmentId !== 'master'
  )
    return payload;

  // Next.js replaces NODE_ENV in the browser. Leave other integrations untouched.
  try {
    if (process.env.NODE_ENV !== 'development') return payload;
  } catch {
    return payload;
  }

  return addFlinklyComponentSourceMap(payload);
}
