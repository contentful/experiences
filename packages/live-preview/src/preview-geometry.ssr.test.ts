import { expect, it } from 'vitest';
import { observePreviewGeometry } from './index.js';

it('imports and disposes geometry observation without browser globals', () => {
  expect(typeof window).toBe('undefined');
  expect(() => observePreviewGeometry({ sourceMap: undefined })()).not.toThrow();
});
