import type {
  ExperiencesCacheMetadata,
  FetchExperienceOptions,
} from '@contentful/experiences-node';

/** Exactly one primary selector; Destination keys never collide with Experience ids. */
export type CacheKeySelector =
  | { readonly experienceId: string; readonly destinationId?: never }
  | {
      readonly experienceId?: never;
      readonly destinationId: string;
      readonly path: string;
      readonly nodeId?: never;
    }
  | {
      readonly experienceId?: never;
      readonly destinationId: string;
      readonly nodeId: string;
      readonly path?: never;
    };

export type CacheKeyInput = CacheKeySelector & {
  readonly spaceId: string;
  readonly environmentId: string;
  readonly contentRevision: string | number;
  readonly locale: string;
  readonly parameters?: FetchExperienceOptions['parameters'];
  /** Application-approved public dimensions; no raw identity or replay. */
  readonly selectionDimensions: Readonly<Record<string, string | number | boolean>>;
};

function selectorKey(input: CacheKeyInput): unknown {
  if (input.experienceId !== undefined) {
    if (input.destinationId !== undefined)
      throw new TypeError('A cache key selects either experienceId or a Destination.');
    // Unchanged from earlier keys, so existing by-ID cache entries stay addressable.
    return scalar(input.experienceId, 'experienceId');
  }
  const { destinationId, path, nodeId } = input as {
    destinationId?: unknown;
    path?: unknown;
    nodeId?: unknown;
  };
  if ((path === undefined) === (nodeId === undefined))
    throw new TypeError('A Destination cache key requires exactly one of path or nodeId.');
  // An object, never a string, so it cannot equal any Experience id slot.
  return path !== undefined
    ? { destinationId: scalar(destinationId, 'destinationId'), path: scalar(path, 'path') }
    : { destinationId: scalar(destinationId, 'destinationId'), nodeId: scalar(nodeId, 'nodeId') };
}

const scalar = (value: unknown, path: string, allowBoolean = false): unknown => {
  if (
    typeof value !== 'string' &&
    !(typeof value === 'number' && Number.isFinite(value)) &&
    !(allowBoolean && typeof value === 'boolean')
  )
    throw new TypeError(
      `${path} must be a string or finite number${allowBoolean ? ' or boolean' : ''}.`
    );
  return value;
};

const ordered = (
  values: unknown,
  path: string,
  mapValue: (value: unknown, path: string) => unknown = scalar
) => {
  if (
    values === null ||
    typeof values !== 'object' ||
    (Object.getPrototypeOf(values) !== Object.prototype && Object.getPrototypeOf(values) !== null)
  )
    throw new TypeError(`${path} must be a plain record.`);
  return Object.entries(values)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => [key, mapValue(value, `${path}.${key}`)]);
};

/** The application owns completeness of the approved public XDA dimensions. */
export function createCacheKey(input: CacheKeyInput): string {
  const parameters =
    input.parameters === undefined
      ? undefined
      : ordered(input.parameters, 'parameters', (value, path) =>
          typeof value === 'object' ? ordered(value, path) : scalar(value, path)
        );
  return encodeURIComponent(
    JSON.stringify([
      input.spaceId,
      input.environmentId,
      selectorKey(input),
      scalar(input.contentRevision, 'contentRevision'),
      input.locale,
      parameters,
      ordered(input.selectionDimensions, 'selectionDimensions', (value, path) =>
        scalar(value, path, true)
      ),
    ])
  );
}

export function createPublicPermutationCacheMetadata({
  permutationKey,
  cacheVersion = 'v1',
  tags,
  ...input
}: CacheKeyInput & {
  readonly permutationKey: string;
  readonly cacheVersion?: string;
  readonly tags?: readonly string[];
}): Extract<ExperiencesCacheMetadata, { scope: 'public-permutation' }> {
  validatePublicPermutationCacheTags(tags);
  return {
    scope: 'public-permutation',
    key: `${cacheVersion}:${encodeURIComponent(permutationKey)}:${createCacheKey(input)}`,
    ...(tags === undefined ? {} : { tags: [...tags] }),
  };
}

/** Next's tag limits; this module stays safe to import from Edge middleware. */
export function validatePublicPermutationCacheTags(
  tags: unknown
): asserts tags is readonly string[] | undefined {
  if (
    tags !== undefined &&
    (!Array.isArray(tags) ||
      tags.length > 128 ||
      tags.some(
        (tag) => typeof tag !== 'string' || !tag.trim() || tag.length > 256 || /[,\r\n]/.test(tag)
      ))
  )
    throw new TypeError(
      'Cache tags must be nonempty strings, up to 128 tags of 256 characters, without commas or line breaks.'
    );
}
