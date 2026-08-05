import { describe, it, expect } from 'vitest';

import * as core from '@contentful/experiences-sdk-core';

import {
  applyTokenResolver,
  getValueForViewport,
  getViewportIndex,
  resolveDesignProperties,
  toCssMediaQuery,
} from './viewport';

describe('toCssMediaQuery', () => {
  it('returns undefined for the wildcard', () => {
    expect(
      toCssMediaQuery({ id: 'd', query: '*', displayName: 'D', previewSize: '' })
    ).toBeUndefined();
  });

  it('translates < to max-width minus one', () => {
    expect(toCssMediaQuery({ id: 't', query: '<992px', displayName: 'T', previewSize: '' })).toBe(
      '(max-width: 991px)'
    );
  });

  it('translates > to min-width plus one', () => {
    expect(toCssMediaQuery({ id: 'l', query: '>1200px', displayName: 'L', previewSize: '' })).toBe(
      '(min-width: 1201px)'
    );
  });

  it('returns undefined for unrecognized formats', () => {
    expect(
      toCssMediaQuery({ id: 'x', query: 'between 100 and 200', displayName: 'X', previewSize: '' })
    ).toBeUndefined();
  });

  it('returns undefined for queries with a leading-prefix garbage', () => {
    expect(
      toCssMediaQuery({ id: 'x', query: 'garbage<992px', displayName: 'X', previewSize: '' })
    ).toBeUndefined();
  });
});

describe('cascade + token helpers re-exported from core', () => {
  // The cascade math and token resolution now live in core; design re-exports
  // them so its public API is unchanged. Assert the re-exports are the very
  // same function references and still behave.
  it('re-exports the same function identities as core', () => {
    expect(getViewportIndex).toBe(core.getViewportIndex);
    expect(getValueForViewport).toBe(core.getValueForViewport);
    expect(resolveDesignProperties).toBe(core.resolveDesignProperties);
    expect(applyTokenResolver).toBe(core.applyTokenResolver);
  });

  it('resolves design properties against an active viewport through the re-export', () => {
    const viewports = [
      { id: 'desktop', query: '*', displayName: 'Desktop', previewSize: '100%' },
      { id: 'mobile', query: '<576px', displayName: 'Mobile', previewSize: '100%' },
    ];
    const resolved = resolveDesignProperties(
      {
        cfPadding: {
          type: 'ValuesByViewport',
          values: {
            desktop: { type: 'ManualDesignValue', value: '40px' },
            mobile: { type: 'ManualDesignValue', value: '8px' },
          },
        },
      },
      viewports,
      1
    );
    expect(resolved).toEqual({ cfPadding: '8px' });
  });
});
