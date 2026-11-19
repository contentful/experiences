import { describe, expect, it } from 'vitest';
import { toCss } from './design-utils';

describe('toCss', () => {
  it('converts bare (non-cf) CSS keys — the shape real payloads use', () => {
    expect(toCss({ fontSize: '20px', backgroundColor: '#4f39f6' })).toEqual({
      fontSize: '20px',
      backgroundColor: '#4f39f6',
    });
  });

  it('still handles cf-prefixed and kebab/snake CSS keys', () => {
    expect(toCss({ cfBackgroundColor: '#4f39f6', 'font-size': '10px', font_weight: 700 })).toEqual({
      backgroundColor: '#4f39f6',
      fontSize: '10px',
      fontWeight: 700,
    });
  });

  it('drops keys that are not known CSS properties (variant, as, ratio, target)', () => {
    expect(
      toCss({ backgroundColor: '#4f39f6', variant: 'h1', as: 'h2', ratio: '1:2', target: '_self' })
    ).toEqual({ backgroundColor: '#4f39f6' });
  });

  it('drops null and undefined values', () => {
    expect(toCss({ padding: null, margin: undefined, color: '#111' })).toEqual({
      color: '#111',
    });
  });

  it('respects an exclude list even for valid CSS keys', () => {
    expect(
      toCss({ backgroundColor: '#4f39f6', padding: '10px' }, { exclude: ['padding'] })
    ).toEqual({ backgroundColor: '#4f39f6' });
  });

  it('respects an include list (still whitelist-filtered)', () => {
    expect(
      toCss(
        { backgroundColor: '#4f39f6', padding: '10px', variant: 'h1' },
        { include: ['backgroundColor', 'variant'] }
      )
    ).toEqual({ backgroundColor: '#4f39f6' });
  });
});
