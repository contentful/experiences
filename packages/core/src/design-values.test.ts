import { describe, it, expect } from 'vitest';

import type { DesignToken, ManualDesignValue } from './types';

import { applyTokenResolver, getDesignValue, resolveDesignProperties } from './design-values';

const m = (value: string | number | boolean): ManualDesignValue => ({
  type: 'ManualDesignValue',
  value,
});

describe('getDesignValue', () => {
  it('unwraps a ManualDesignValue to its scalar', () => {
    expect(getDesignValue(m('40px'))).toBe('40px');
  });

  it('unwraps non-string scalars', () => {
    expect(getDesignValue(m(24))).toBe(24);
    expect(getDesignValue(m(true))).toBe(true);
  });

  it('passes a DesignToken through unchanged', () => {
    const token: DesignToken = { type: 'DesignToken', value: 'color.primary' };
    expect(getDesignValue(token)).toEqual(token);
  });

  it('returns undefined when the prop is missing', () => {
    expect(getDesignValue(undefined)).toBeUndefined();
  });
});

describe('resolveDesignProperties', () => {
  it('resolves every property to its value', () => {
    const resolved = resolveDesignProperties({
      cfPadding: m('40px'),
      cfBorder: m('1px solid #eee'),
    });

    expect(resolved.cfPadding).toBe('40px');
    expect(resolved.cfBorder).toBe('1px solid #eee');
  });

  it('handles a mix of ManualDesignValue and DesignToken', () => {
    const resolved = resolveDesignProperties({
      cfPadding: m('20px'),
      cfColor: { type: 'DesignToken', value: 'color.primary' },
    });

    expect(resolved.cfPadding).toBe('20px');
    expect(resolved.cfColor).toEqual({ type: 'DesignToken', value: 'color.primary' });
  });

  it('returns {} for missing input', () => {
    expect(resolveDesignProperties(undefined)).toEqual({});
  });

  it('returns {} for an empty record', () => {
    expect(resolveDesignProperties({})).toEqual({});
  });
});

describe('applyTokenResolver', () => {
  const token = (value: string): DesignToken => ({ type: 'DesignToken', value });

  it('passes scalars through and reports no unresolved ids when no resolver is supplied and there are no tokens', () => {
    const input = { cfPadding: '20px', cfActive: true };
    const { props, unresolved } = applyTokenResolver(input);
    expect(props).toEqual(input);
    expect(unresolved).toEqual([]);
  });

  it('passes a DesignToken through raw and reports it unresolved when no resolver is supplied', () => {
    const { props, unresolved } = applyTokenResolver({
      cfPadding: '20px',
      cfColor: { type: 'DesignToken', value: 'color.primary' },
    });
    expect(props).toEqual({
      cfPadding: '20px',
      cfColor: { type: 'DesignToken', value: 'color.primary' },
    });
    expect(unresolved).toEqual(['color.primary']);
  });

  it('replaces DesignToken values with the resolver output', () => {
    const { props, unresolved } = applyTokenResolver(
      {
        cfPadding: '20px',
        cfColor: { type: 'DesignToken', value: 'color.primary' },
        cfBackground: { type: 'DesignToken', value: 'bg/hero' },
      },
      (ref) =>
        ref.value === 'color.primary' ? '#4f39f6' : ref.value === 'bg/hero' ? '#fafafa' : undefined
    );
    expect(props).toEqual({ cfPadding: '20px', cfColor: '#4f39f6', cfBackground: '#fafafa' });
    expect(unresolved).toEqual([]);
  });

  it('passes the raw token through and reports unresolved ids when the resolver returns undefined', () => {
    const { props, unresolved } = applyTokenResolver(
      {
        cfPadding: '20px',
        cfColor: token('color.primary'),
        cfBackground: token('bg/unknown'),
      },
      (ref) => (ref.value === 'color.primary' ? '#4f39f6' : undefined)
    );
    expect(props).toEqual({
      cfPadding: '20px',
      cfColor: '#4f39f6',
      cfBackground: token('bg/unknown'),
    });
    expect(unresolved).toEqual(['bg/unknown']);
  });

  it('leaves scalar props alone even when the resolver would map them', () => {
    const { props } = applyTokenResolver({ cfPadding: '20px', cfActive: true }, () => 'nope');
    expect(props).toEqual({ cfPadding: '20px', cfActive: true });
  });

  it('preserves the id shape verbatim in unresolved reports', () => {
    const { unresolved } = applyTokenResolver(
      {
        a: token('color.surface.hero'),
        b: token('color/surface/hero'),
        c: token('colorSurfaceLight'),
      },
      () => undefined
    );
    expect(unresolved).toEqual(['color.surface.hero', 'color/surface/hero', 'colorSurfaceLight']);
  });
});
