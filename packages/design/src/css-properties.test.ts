import { describe, it, expect } from 'vitest';

import { isCssProperty, toCssKey } from './css-properties';

describe('toCssKey', () => {
  it('leaves already-camelCased keys untouched', () => {
    expect(toCssKey('fontSize')).toBe('fontSize');
    expect(toCssKey('backgroundColor')).toBe('backgroundColor');
  });

  it('strips a leading cf prefix in its three shapes', () => {
    expect(toCssKey('cfFontSize')).toBe('fontSize');
    expect(toCssKey('cf-font-size')).toBe('fontSize');
    expect(toCssKey('cf_font_size')).toBe('fontSize');
  });

  it('camelCases kebab and snake case', () => {
    expect(toCssKey('font-size')).toBe('fontSize');
    expect(toCssKey('background_color')).toBe('backgroundColor');
  });

  it('keeps the original key when only "cf" is present', () => {
    expect(toCssKey('cf')).toBe('cf');
  });
});

describe('isCssProperty', () => {
  it('accepts known CSS properties', () => {
    expect(isCssProperty('fontSize')).toBe(true);
    expect(isCssProperty('backgroundColor')).toBe(true);
    expect(isCssProperty('gap')).toBe(true);
    expect(isCssProperty('gridTemplateColumns')).toBe(true);
  });

  it('rejects author-defined semantic keys', () => {
    expect(isCssProperty('variant')).toBe(false);
    expect(isCssProperty('as')).toBe(false);
    expect(isCssProperty('ratio')).toBe(false);
    expect(isCssProperty('target')).toBe(false);
    expect(isCssProperty('reverse')).toBe(false);
  });
});
