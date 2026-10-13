import { describe, expect, it } from 'vitest';

describe('Tracking attributes entry on the server', () => {
  it('imports without a DOM', async () => {
    const entry = await import('./tracking-attributes.js');

    expect(entry.getTrackingAttributes({ roots: [{ key: 's0' }] })).toEqual({
      'data-ctfl-scopes': 's0',
    });
  });
});
