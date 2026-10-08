import { describe, expect, it } from 'vitest';

import type { DesignToken } from './types';

import { applyTokenResolver, resolveDesignProperties } from './design-properties';

describe('resolveDesignProperties', () => {
  it('unwraps manual values and preserves token references', () => {
    const token: DesignToken = { type: 'DesignToken', value: 'color.primary' };

    expect(
      resolveDesignProperties({
        cfPadding: { type: 'ManualDesignValue', value: '20px' },
        cfEnabled: { type: 'ManualDesignValue', value: true },
        cfColor: token,
      })
    ).toEqual({ cfPadding: '20px', cfEnabled: true, cfColor: token });
  });

  it('returns an empty record for missing design properties', () => {
    expect(resolveDesignProperties(undefined)).toEqual({});
  });
});

describe('applyTokenResolver', () => {
  it('passes scalar values through unchanged', () => {
    const input = { cfPadding: '20px', cfActive: true };

    expect(applyTokenResolver(input)).toEqual({ props: input, unresolved: [] });
  });

  it('keeps unresolved tokens and reports their ids', () => {
    const token: DesignToken = { type: 'DesignToken', value: 'color.primary' };

    expect(applyTokenResolver({ cfColor: token })).toEqual({
      props: { cfColor: token },
      unresolved: ['color.primary'],
    });
  });

  it('replaces tokens with the resolver output', () => {
    expect(
      applyTokenResolver(
        {
          cfPadding: '20px',
          cfColor: { type: 'DesignToken', value: 'color.primary' },
          cfBackground: { type: 'DesignToken', value: 'bg/hero' },
        },
        (ref) =>
          ref.value === 'color.primary'
            ? '#4f39f6'
            : ref.value === 'bg/hero'
              ? '#fafafa'
              : undefined
      )
    ).toEqual({
      props: { cfPadding: '20px', cfColor: '#4f39f6', cfBackground: '#fafafa' },
      unresolved: [],
    });
  });
});
