import type { ExperiencePayload } from '@contentful/experiences-sdk-core';

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

export function isErrorPayload(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.sys) || Array.isArray(value.sys)) return false;
  return value.sys.type === 'Error' && typeof value.sys.id === 'string';
}
