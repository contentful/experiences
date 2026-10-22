import { describe, expect, it } from 'vitest';
import { normalizeExplicitLocale, normalizeLocale } from './locale.js';

describe('locale helpers', () => {
  it('normalizes locale candidates', () => {
    expect(normalizeLocale(' de_DE ')).toBe('de-DE');
    expect(normalizeLocale('*')).toBeUndefined();
    expect(normalizeLocale('und')).toBeUndefined();
    expect(normalizeLocale('UND')).toBeUndefined();
    expect(normalizeLocale('')).toBeUndefined();
    expect(normalizeLocale('not a locale')).toBeUndefined();
  });

  it('throws for invalid explicit locale values', () => {
    expect(() => normalizeExplicitLocale('*')).toThrow(/valid locale/);
    expect(() => normalizeExplicitLocale('not a locale')).toThrow(/valid locale/);
    expect(() => normalizeExplicitLocale(null)).toThrow(/locale string/);
  });
});
