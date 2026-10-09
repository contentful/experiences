import { describe, expect, it } from 'vitest';

import {
  getTrackingAttributes,
  TRACKING_CLICKABLE_ATTRIBUTE,
  TRACKING_SCOPES_ATTRIBUTE,
} from './tracking-attributes.js';

// The helpers live in core; this subpath must keep re-exporting them.
describe('tracking attributes subpath', () => {
  it('re-exports the attribute builder', () => {
    expect(getTrackingAttributes({ roots: [{ key: 's0' }, { key: 's3' }] })).toEqual({
      'data-ctfl-scopes': 's0 s3',
    });
    expect(getTrackingAttributes(undefined)).toEqual({});
  });

  it('re-exports the attribute names the runtime reads', () => {
    expect(TRACKING_SCOPES_ATTRIBUTE).toBe('data-ctfl-scopes');
    expect(TRACKING_CLICKABLE_ATTRIBUTE).toBe('data-ctfl-clickable');
  });
});
