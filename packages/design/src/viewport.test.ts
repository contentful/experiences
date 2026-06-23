import { describe, it, expect } from 'vitest';

import type {
  DesignPropValue,
  ManualDesignValue,
  ValuesByViewport,
  ViewportDef,
} from '@contentful/experiences-core';

import {
  getValueForViewport,
  getViewportIndex,
  resolveDesignProperties,
  toCssMediaQuery,
} from './viewport';

const VIEWPORTS: ViewportDef[] = [
  { id: 'desktop', query: '*', displayName: 'Desktop', previewSize: '100%' },
  { id: 'tablet', query: '<992px', displayName: 'Tablet', previewSize: '100%' },
  { id: 'mobile', query: '<576px', displayName: 'Mobile', previewSize: '100%' },
];

const m = (value: string | number | boolean): ManualDesignValue => ({
  type: 'ManualDesignValue',
  value,
});

const vbv = (values: Record<string, ManualDesignValue>): ValuesByViewport => ({
  type: 'ValuesByViewport',
  values,
});

describe('toCssMediaQuery', () => {
  it('returns undefined for the wildcard', () => {
    expect(toCssMediaQuery({ id: 'd', query: '*', displayName: 'D', previewSize: '' })).toBeUndefined();
  });

  it('translates < to max-width minus one', () => {
    expect(toCssMediaQuery({ id: 't', query: '<992px', displayName: 'T', previewSize: '' })).toBe(
      '(max-width: 991px)',
    );
  });

  it('translates > to min-width plus one', () => {
    expect(toCssMediaQuery({ id: 'l', query: '>1200px', displayName: 'L', previewSize: '' })).toBe(
      '(min-width: 1201px)',
    );
  });

  it('returns undefined for unrecognized formats', () => {
    expect(
      toCssMediaQuery({ id: 'x', query: 'between 100 and 200', displayName: 'X', previewSize: '' }),
    ).toBeUndefined();
  });
});

describe('getViewportIndex', () => {
  it('returns 0 when no id is provided', () => {
    expect(getViewportIndex(VIEWPORTS)).toBe(0);
  });

  it('finds the matching viewport', () => {
    expect(getViewportIndex(VIEWPORTS, 'tablet')).toBe(1);
    expect(getViewportIndex(VIEWPORTS, 'mobile')).toBe(2);
  });

  it('returns 0 for an unknown viewport id', () => {
    expect(getViewportIndex(VIEWPORTS, 'nope')).toBe(0);
  });
});

describe('getValueForViewport', () => {
  it('unwraps a ManualDesignValue envelope to its scalar', () => {
    expect(getValueForViewport(m('40px'), VIEWPORTS, 0)).toBe('40px');
  });

  it('passes a DesignToken envelope through unchanged', () => {
    const token: DesignPropValue = { type: 'DesignToken', value: 'color.primary' };
    expect(getValueForViewport(token, VIEWPORTS, 0)).toEqual(token);
  });

  it('resolves a ValuesByViewport bag for the active viewport', () => {
    expect(
      getValueForViewport(vbv({ desktop: m('40px'), mobile: m('12px') }), VIEWPORTS, 0),
    ).toBe('40px');
  });

  it('cascades back through earlier viewports when the active one has no value', () => {
    // active = mobile (index 2); only desktop has a value → cascades to desktop
    expect(getValueForViewport(vbv({ desktop: m('40px') }), VIEWPORTS, 2)).toBe('40px');
  });

  it('returns the most-specific value when multiple are defined', () => {
    // active = tablet (index 1); tablet has its own value
    expect(
      getValueForViewport(vbv({ desktop: m('40px'), tablet: m('24px') }), VIEWPORTS, 1),
    ).toBe('24px');
  });

  it('returns undefined when nothing in the cascade has a value', () => {
    expect(getValueForViewport(vbv({ mobile: m('12px') }), VIEWPORTS, 0)).toBeUndefined();
  });

  it('returns undefined when the prop is missing', () => {
    expect(getValueForViewport(undefined, VIEWPORTS, 0)).toBeUndefined();
  });

  it('passes through a DesignToken inside a ValuesByViewport cascade', () => {
    const token: ManualDesignValue | { type: 'DesignToken'; value: string } = {
      type: 'DesignToken',
      value: 'color.primary',
    };
    expect(
      getValueForViewport(
        vbv({ desktop: token as ManualDesignValue }),
        VIEWPORTS,
        0,
      ),
    ).toEqual({ type: 'DesignToken', value: 'color.primary' });
  });
});

describe('resolveDesignProperties', () => {
  it('resolves every property to its active-viewport value', () => {
    const resolved = resolveDesignProperties(
      {
        cfPadding: vbv({ desktop: m('40px'), mobile: m('12px') }),
        cfBorder: vbv({ desktop: m('1px solid #eee') }),
      },
      VIEWPORTS,
      2, // mobile
    );

    expect(resolved.cfPadding).toBe('12px');
    expect(resolved.cfBorder).toBe('1px solid #eee'); // cascades from desktop
  });

  it('handles a mix of ManualDesignValue, ValuesByViewport, and DesignToken', () => {
    const resolved = resolveDesignProperties(
      {
        cfPadding: m('20px'),
        cfMargin: vbv({ desktop: m('40px') }),
        cfColor: { type: 'DesignToken', value: 'color.primary' },
      },
      VIEWPORTS,
      0,
    );

    expect(resolved.cfPadding).toBe('20px');
    expect(resolved.cfMargin).toBe('40px');
    expect(resolved.cfColor).toEqual({ type: 'DesignToken', value: 'color.primary' });
  });

  it('omits properties with no resolved value', () => {
    const resolved = resolveDesignProperties(
      { cfPadding: vbv({ mobile: m('12px') }) },
      VIEWPORTS,
      0, // desktop, no cascade upward
    );

    expect(resolved).toEqual({});
  });

  it('returns {} for missing input', () => {
    expect(resolveDesignProperties(undefined, VIEWPORTS, 0)).toEqual({});
  });
});
