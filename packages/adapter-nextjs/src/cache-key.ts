import type {
  ExperiencesCacheMetadata,
  FetchExperienceOptions,
} from '@contentful/experiences-node';

export interface NextjsExperiencesCacheKeyInput {
  readonly spaceId: string;
  readonly environmentId: string;
  readonly experienceId: string;
  readonly contentRevision: string | number;
  readonly locale: string;
  readonly parameters?: FetchExperienceOptions['parameters'];
  /** Application-approved public dimensions; no raw identity or replay. */
  readonly selectionDimensions: Readonly<Record<string, string | number | boolean>>;
}

const ordered = <Value>(values: Readonly<Record<string, Value>>): [string, Value][] =>
  Object.keys(values)
    .sort()
    .map((key) => [key, values[key]!]);

/** The application owns completeness of the approved public XDA dimensions. */
export function createExperiencesCacheKey(input: NextjsExperiencesCacheKeyInput): string {
  const parameters =
    input.parameters === undefined
      ? undefined
      : ordered(input.parameters).map(([key, value]) => [
          key,
          typeof value === 'object' ? ordered(value) : value,
        ]);
  return encodeURIComponent(
    JSON.stringify([
      input.spaceId,
      input.environmentId,
      input.experienceId,
      input.contentRevision,
      input.locale,
      parameters,
      ordered(input.selectionDimensions),
    ])
  );
}

export function createPublicPermutationCacheMetadata({
  permutationKey,
  cacheVersion = 'v1',
  tags,
  ...input
}: NextjsExperiencesCacheKeyInput & {
  readonly permutationKey: string;
  readonly cacheVersion?: string;
  readonly tags?: readonly string[];
}): Extract<ExperiencesCacheMetadata, { scope: 'public-permutation' }> {
  validateNextjsPublicPermutationCacheTags(tags);
  return {
    scope: 'public-permutation',
    key: `${cacheVersion}:${encodeURIComponent(permutationKey)}:${createExperiencesCacheKey(input)}`,
    ...(tags === undefined ? {} : { tags: [...tags] }),
  };
}

/** Next's tag limits; this module stays safe to import from Edge middleware. */
export function validateNextjsPublicPermutationCacheTags(
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
