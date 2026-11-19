import { describe, expect, it } from 'vitest';
import { toCss } from './design-utils.js';

describe('toCss (Svelte)', () => {
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
      toCss({
        backgroundColor: '#4f39f6',
        variant: 'h1',
        as: 'h2',
        ratio: '1:2',
        target: '_self',
      })
    ).toEqual({ backgroundColor: '#4f39f6' });
  });

  it('drops non-scalar (object/array/bool) values by design', () => {
    // toCss produces something spreadable into an inline style — booleans
    // and objects can't be inline-styled without opinionation, so they drop.
    expect(
      toCss({
        padding: '10px',
        reverse: true,
        nested: { color: 'red' } as unknown as string,
      })
    ).toEqual({ padding: '10px' });
  });

  it('respects include/exclude lists', () => {
    expect(
      toCss({ backgroundColor: '#4f39f6', padding: '10px' }, { include: ['backgroundColor'] })
    ).toEqual({ backgroundColor: '#4f39f6' });
    expect(
      toCss({ backgroundColor: '#4f39f6', padding: '10px' }, { exclude: ['padding'] })
    ).toEqual({ backgroundColor: '#4f39f6' });
  });
});
