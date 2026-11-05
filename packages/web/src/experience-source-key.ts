import type {
  RuntimeFetchExperienceOptions,
  RuntimeFetchResolveOptions,
} from '@contentful/experiences-runtime';

export interface ExperienceSourceContext {
  request: RuntimeFetchExperienceOptions;
  revision: readonly unknown[];
}

/** Optimization's normalized query-key approach, extended to structured XDA parameters. */
export function getExperienceSourceKey(
  { request, revision }: ExperienceSourceContext,
  resolve: RuntimeFetchResolveOptions,
  sourceRevision: number,
  operation: string
): string | undefined {
  if (request.personalization?.events !== undefined) return undefined;
  try {
    const query = Object.fromEntries(
      Object.entries(request).filter(([, value]) => value !== undefined)
    );
    return JSON.stringify(
      canonical([
        query,
        resolve.metadata ?? {},
        resolve.debug ?? false,
        revision,
        sourceRevision,
        operation,
      ])
    );
  } catch {
    // Opaque values (including functions) cannot establish a shared request identity.
    return undefined;
  }
}

function canonical(value: unknown, seen = new Set<object>()): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object' || seen.has(value)) throw new TypeError('Opaque source input');
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype)
    throw new TypeError('Opaque source input');
  seen.add(value);
  const result = Array.isArray(value)
    ? value.map((item) => canonical(item, seen))
    : Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => (a > b ? 1 : -1))
          .map(([key, item]) => [key, canonical(item, seen)])
      );
  seen.delete(value);
  return result;
}
