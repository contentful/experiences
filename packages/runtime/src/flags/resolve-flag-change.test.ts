import { describe, expect, it } from 'vitest';
import { resolveFlagChange } from '../index.js';

const change = {
  type: 'Variable' as const,
  key: 'flag',
  value: true,
  meta: { experienceId: 'experiment', variantIndex: 0 },
};

describe('resolveFlagChange', () => {
  it.each([false, 0, '', null])('preserves the JSON value %j', (value) => {
    expect(resolveFlagChange('flag', [{ ...change, value }])).toEqual({ ...change, value });
  });

  it.each([
    [{ value: { theme: 'dark' } }, { theme: 'dark' }],
    [{ value: [false, 0, null] }, [false, 0, null]],
    [{ value: null }, null],
    [{ value: false }, { value: false }],
    [{ value: 0 }, { value: 0 }],
    [{ value: '' }, { value: '' }],
    [{ theme: 'dark' }, { theme: 'dark' }],
  ])('matches wrapped-object normalization for %j', (value, expected) => {
    const changes = [{ ...change, value }];
    expect(resolveFlagChange('flag', changes)?.value).toEqual(expected);
    expect(changes[0]?.value).toEqual(value);
  });

  it('returns the last valid matching record and its metadata in a mixed list', () => {
    const winner = {
      ...change,
      value: { value: { theme: 'dark' } },
      meta: { experienceId: 'winner', variantIndex: 2 },
    };
    expect(
      resolveFlagChange('flag', [
        change,
        { ...change, key: 'other', value: 42 },
        winner,
        { type: 'Experience', id: 'entry', variantId: 'variant', meta: {} },
        { ...change, type: 'Fragment', value: 'ignored' },
        { ...change, value: undefined },
        { ...change, value: [1, 2] },
        { ...change, meta: { experienceId: 'invalid', variantIndex: '2' } },
        { ...change, value: { invalid: undefined } },
        { ...change, value: NaN },
        null,
        undefined,
        'flag',
      ])
    ).toEqual({ ...winner, value: { theme: 'dark' } });
  });

  it.each(['__proto__', 'constructor', 'toString'])('resolves the exact special key %s', (key) => {
    expect(resolveFlagChange(key, [{ ...change, key }])).toEqual({ ...change, key });
    expect(resolveFlagChange(key, [])).toBeUndefined();
  });

  it('returns undefined for absent flags and wholly malformed input', () => {
    expect(resolveFlagChange('flag')).toBeUndefined();
    expect(resolveFlagChange('missing', [change])).toBeUndefined();
    expect(resolveFlagChange('flag', [{ ...change, meta: undefined }])).toBeUndefined();
  });
});
