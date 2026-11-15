import { describe, expect, it } from 'vitest';
import {
  createCacheKey,
  createPublicPermutationCacheMetadata,
  validatePublicPermutationCacheTags,
  type CacheKeyInput,
} from './cache-key.js';

const input = {
  spaceId: 'space',
  environmentId: 'master',
  experienceId: 'home',
  contentRevision: 2,
  locale: 'en-US',
  selectionDimensions: { audience: 'public', enabled: false, count: 1.5 },
  parameters: { text: '', count: -1.5, filter: { b: 2, a: 1 }, empty: {} },
};

describe('approved public cache metadata', () => {
  it('normalizes parameter/dimension ordering and retains meaningful input changes', () => {
    const key = createCacheKey(input);
    expect(
      createCacheKey({
        ...input,
        parameters: { empty: {}, filter: { a: 1, b: 2 }, count: -1.5, text: '' },
        selectionDimensions: { count: 1.5, enabled: false, audience: 'public' },
      })
    ).toBe(key);
    expect(createCacheKey({ ...input, locale: 'de-DE' })).not.toBe(key);
    expect(createCacheKey({ ...input, contentRevision: 3 })).not.toBe(key);
    expect(createCacheKey({ ...input, contentRevision: 'revision' })).not.toBe(key);
    expect(createCacheKey({ ...input, parameters: { filter: {} } })).not.toBe(key);
    expect(decodeURIComponent(key)).toBe(
      '["space","master","home",2,"en-US",[["count",-1.5],["empty",[]],["filter",[["a",1],["b",2]]],["text",""]],[["audience","public"],["count",1.5],["enabled",false]]]'
    );
  });
  it.each([
    ['parameters', null, 'parameters'],
    ['parameters', { filter: null }, 'parameters.filter'],
    ['parameters', { filter: ['value'] }, 'parameters.filter'],
    ['parameters', { filter: new Date(0) }, 'parameters.filter'],
    ['parameters', { filter: { nested: {} } }, 'parameters.filter.nested'],
    ['parameters', { filter: { count: Infinity } }, 'parameters.filter.count'],
    ['parameters', { value: true }, 'parameters.value'],
    ['parameters', { value: undefined }, 'parameters.value'],
    ['parameters', { value: NaN }, 'parameters.value'],
    ['selectionDimensions', [], 'selectionDimensions'],
    ['selectionDimensions', { audience: {} }, 'selectionDimensions.audience'],
    ['selectionDimensions', { audience: -Infinity }, 'selectionDimensions.audience'],
    ['contentRevision', Infinity, 'contentRevision'],
    ['contentRevision', true, 'contentRevision'],
  ])('rejects unsupported %s input %j with its location', (field, value, path) => {
    expect(() =>
      createCacheKey({
        ...input,
        [field]: value,
      } as unknown as CacheKeyInput)
    ).toThrow(new RegExp(`${path} must be`));
  });
  it('separates destination path, node, destination identity and Experience selectors', () => {
    const { experienceId: _id, parameters: _parameters, ...common } = input;
    const path = { ...common, destinationId: 'site', path: '/page' };
    const key = createCacheKey(path);
    expect(createCacheKey({ ...path, destinationId: 'other' })).not.toBe(key);
    expect(createCacheKey({ ...common, destinationId: 'site', nodeId: '/page' })).not.toBe(key);
    expect(createCacheKey({ ...common, experienceId: '/page' })).not.toBe(key);
    expect(createCacheKey({ ...path, path: '/page?query=value' })).not.toBe(key);
    // @ts-expect-error Select exactly one source selector.
    const invalid: CacheKeyInput = { ...path, experienceId: 'catalog-experience' };
    void invalid;
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
