import { describe, expect, it } from 'vitest';
import {
  createCacheKey,
  createPublicPermutationCacheMetadata,
  validatePublicPermutationCacheTags,
} from './key.js';

const input = {
  spaceId: 'space',
  environmentId: 'master',
  experienceId: 'home',
  contentRevision: 2,
  locale: 'en-US',
  selectionDimensions: { audience: 'public' },
  parameters: { filter: { b: 2, a: 1 } },
};

describe('approved public cache metadata', () => {
  it('normalizes parameter/dimension ordering and retains meaningful input changes', () => {
    const key = createCacheKey(input);
    expect(createCacheKey({ ...input, parameters: { filter: { a: 1, b: 2 } } })).toBe(key);
    expect(createCacheKey({ ...input, locale: 'de-DE' })).not.toBe(key);
    expect(createCacheKey({ ...input, contentRevision: 3 })).not.toBe(key);
    expect(createCacheKey({ ...input, parameters: { filter: {} } })).not.toBe(key);
  });
  it('carries detached tags with the application permutation key and version', () => {
    const tags = ['content:home'];
    const metadata = createPublicPermutationCacheMetadata({
      ...input,
      permutationKey: 'public',
      cacheVersion: '2',
      tags,
    });
    expect(metadata).toMatchObject({ scope: 'public-permutation', tags });
    expect(metadata.tags).not.toBe(tags);
    expect(metadata.key).toContain('2:public:');
  });
  it('enforces the Next tag boundary', () => {
    for (const tags of [['bad,tag'], ['bad\nline'], ['a'.repeat(257)], Array(129).fill('tag')])
      expect(() => validatePublicPermutationCacheTags(tags)).toThrow();
  });
});
