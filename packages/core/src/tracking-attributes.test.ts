import { describe, expect, it } from 'vitest';

import {
  getTrackingAttributes,
  TRACKING_CLICKABLE_ATTRIBUTE,
  TRACKING_SCOPES_ATTRIBUTE,
} from './tracking-attributes';

describe('tracking attributes', () => {
  it('serializes plan attribution once for its rendered container without changing it', () => {
    const scope = Object.freeze({
      key: 's0:a',
      entityId: 'landing',
      entityKind: 'Experience' as const,
    });
    const attribution = Object.freeze({ scopes: Object.freeze({ 's0:a': scope }) });

    const attributes = getTrackingAttributes(attribution);

    expect(JSON.parse(attributes['data-ctfl-attribution']!)).toEqual({
      scopes: { 's0:a': { entityId: 'landing', entityKind: 'Experience' } },
    });
    expect(attribution.scopes['s0:a']).toBe(scope);
  });

  it('retains every event attribution field and excludes unrelated caller data', () => {
    const scope = {
      key: 'fragment',
      entityId: 'hero',
      entityKind: 'ExperienceFragment' as const,
      entityKindId: 'fragment-type',
      variantId: 'variant',
      variantIndex: 1,
      optimizationId: 'optimization',
      parentExperienceId: 'landing',
      parentVariantId: 'parent-variant',
      entryIds: ['entry-1', 'entry-2'],
      content: { ignored: true },
    };
    const { key: _key, content: _content, ...eventData } = scope;
    const attributes = getTrackingAttributes({ scopes: { fragment: scope } });

    expect(JSON.parse(attributes['data-ctfl-attribution']!)).toEqual({
      scopes: { fragment: eventData },
    });
  });

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
