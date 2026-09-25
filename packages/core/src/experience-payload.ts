import type { ExperiencePayload } from './types.js';

/** Dependency-free structural guard for Experience payloads received as JSON. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isExperiencePayload(value: unknown): value is ExperiencePayload {
  if (
    !isRecord(value) ||
    !Array.isArray(value.nodes) ||
    (value.viewports !== undefined && !Array.isArray(value.viewports))
  ) {
    return false;
  }

  const sys = value.sys;
  return isRecord(sys) && !Array.isArray(sys) && sys.type === 'Experience';
}
