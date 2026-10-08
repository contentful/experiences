import { describe, expect, it } from 'vitest';

import {
  getTrackingAttributes,
  TRACKING_CLICKABLE_ATTRIBUTE,
  TRACKING_SCOPES_ATTRIBUTE,
} from './tracking-attributes';

describe('tracking attributes', () => {
  it('lists the keys of the scopes a node roots, outer to inner', () => {
    expect(getTrackingAttributes({ roots: [{ key: 's0:a' }, { key: 's3:a' }] })).toEqual({
      'data-ctfl-scopes': 's0:a s3:a',
    });
  });

  it('returns no attributes for a node that roots nothing or has no attribution', () => {
    expect(getTrackingAttributes({ roots: [] })).toEqual({});
    expect(getTrackingAttributes(undefined)).toEqual({});
  });

  it('publishes the attribute names the runtime reads', () => {
    expect(TRACKING_SCOPES_ATTRIBUTE).toBe('data-ctfl-scopes');
    expect(TRACKING_CLICKABLE_ATTRIBUTE).toBe('data-ctfl-clickable');
  });
});
