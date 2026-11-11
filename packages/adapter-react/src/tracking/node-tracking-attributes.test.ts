import { describe, expect, it } from 'vitest';
import type { NodeAttribution } from '@contentful/experiences-sdk-core';

import { getNodeTrackingAttributes } from './node-tracking-attributes.js';

const scope = { key: 'root', entityId: 'experience', entityKind: 'Experience' as const };
const attribution: NodeAttribution = { roots: [scope], scopes: [scope] };

describe('Optimization-compatible node tracking overrides', () => {
  it('leaves Web defaults/caller controls untouched when overrides are absent', () => {
    expect(getNodeTrackingAttributes(attribution, {})).toEqual({ 'data-ctfl-scopes': 'root' });
  });

  it('maps independent kinds without removing real attribution', () => {
    expect(
      getNodeTrackingAttributes(attribution, {
        trackViews: false,
        trackHovers: true,
        trackClicks: false,
        clickable: true,
      })
    ).toEqual({
      'data-ctfl-scopes': 'root',
      'data-ctfl-track-views': false,
      'data-ctfl-track-hovers': true,
      'data-ctfl-track-clicks': false,
      'data-ctfl-clickable': true,
    });
  });

  it('does not fabricate attribution when opting unattributed roots into tracking', () => {
    expect(getNodeTrackingAttributes(undefined, { trackViews: true, clickable: false })).toEqual({
      'data-ctfl-track-views': true,
      'data-ctfl-clickable': undefined,
    });
  });
});
