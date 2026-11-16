import type { ExperienceParameters } from '@contentful/experiences-nextjs/server';

export type SearchParams = Record<string, string | string[] | undefined>;

export function flag(value: string | string[] | undefined) {
  return value === 'true' || value === '1';
}

export function parseParameters(input: string): ExperienceParameters {
  const parsed: unknown = JSON.parse(input);
  // Delivery owns parameter names and values; the form checks the envelope.
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Expected a JSON object');
  }
  return parsed as ExperienceParameters;
}
