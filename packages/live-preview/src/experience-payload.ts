import { isRecord } from '@contentful/experiences-sdk-core';

export { isRecord } from '@contentful/experiences-sdk-core';

export function isErrorPayload(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.sys) || Array.isArray(value.sys)) return false;
  return value.sys.type === 'Error' && typeof value.sys.id === 'string';
}
