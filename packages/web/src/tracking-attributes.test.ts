import { describe, expect, it } from 'vitest';

import {
  getTrackingAttributes,
  TRACKING_CLICKABLE_ATTRIBUTE,
  TRACKING_NODE_ATTRIBUTE,
} from './tracking-attributes.js';

describe('tracking attributes', () => {
  it('puts the node id on the tracking attribute', () => {
    expect(getTrackingAttributes('node:hero')).toEqual({ 'data-ctfl-node-id': 'node:hero' });
  });

  it('returns no attributes for a node without an id', () => {
    expect(getTrackingAttributes(undefined)).toEqual({});
    expect(getTrackingAttributes('')).toEqual({});
  });

  it('publishes the attribute names the runtime reads', () => {
    expect(TRACKING_NODE_ATTRIBUTE).toBe('data-ctfl-node-id');
    expect(TRACKING_CLICKABLE_ATTRIBUTE).toBe('data-ctfl-clickable');
  });
});
