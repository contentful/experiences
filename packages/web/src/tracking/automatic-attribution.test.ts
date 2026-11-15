// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { readAutomaticKeys, readManualViewKey } from './automatic-attribution.js';

const PAGE = { entityId: 'page', entityKind: 'Experience' };
const HERO = { entityId: 'hero', entityKind: 'ExperienceFragment' };
const metadata = (element: Element, scopes: Record<string, unknown>) =>
  element.setAttribute('data-ctfl-attribution', JSON.stringify({ scopes }));
const root = (scopes = 'page hero') => {
  const element = document.createElement('button');
  element.setAttribute('data-ctfl-scopes', scopes);
  document.body.append(element);
  return element;
};
afterEach(() => {
  document.body.replaceChildren();
  document.body.removeAttribute('data-ctfl-attribution');
});

describe('automatic attribution', () => {
  it('groups automatic scope keys within a boundary but gives each manual root its own final key', () => {
    metadata(document.body, { page: PAGE, hero: HERO });
    const first = root();
    const second = root();
    expect(readAutomaticKeys(first).map((key) => key.attribution)).toEqual([PAGE, HERO]);
    expect(readAutomaticKeys(first)[1]).toBe(readAutomaticKeys(second)[1]);
    const firstManual = readManualViewKey(first);
    const secondManual = readManualViewKey(second);
    expect(firstManual?.attribution).toEqual(HERO);
    expect(secondManual?.attribution).toEqual(HERO);
    expect(firstManual).not.toBe(secondManual);
    expect(readManualViewKey(first)).toBe(firstManual);
  });

  it.each([
    ['page missing', undefined],
    ['page invalid', undefined],
    ['page hero', '{'],
    ['page hero', 'null'],
    ['page hero', '{"scopes":[]}'],
  ])('does not fall back from final scope %s with invalid nearest metadata %s', (scopes, raw) => {
    metadata(document.body, { page: PAGE, hero: HERO, invalid: { ...HERO, entryIds: [42] } });
    const boundary = document.createElement('section');
    if (raw) boundary.setAttribute('data-ctfl-attribution', raw);
    document.body.append(boundary);
    const element = root(scopes);
    boundary.append(element);
    expect(readManualViewKey(element)).toBeUndefined();
  });

  it.each([
    '{',
    'null',
    '[]',
    '{}',
    '{"scopes":[]}',
    '{"scopes":{"hero":{"entityId":"inline","entityKind":"Unknown"}}}',
    '{"scopes":{"hero":{"entityId":12,"entityKind":"ExperienceFragment"}}}',
    '{"scopes":{"hero":{"entityId":"hero","entityKind":"ExperienceFragment","entryIds":[42]}}}',
  ])(
    'rejects malformed nearest metadata without falling through to an outer boundary: %s',
    (raw) => {
      metadata(document.body, { hero: HERO });
      const boundary = document.createElement('section');
      boundary.setAttribute('data-ctfl-attribution', raw);
      document.body.append(boundary);
      const element = root('hero');
      boundary.append(element);
      expect(() => readAutomaticKeys(element)).not.toThrow();
      expect(readAutomaticKeys(element)).toEqual([]);
      expect(readManualViewKey(element)).toBeUndefined();
    }
  );

  it('uses nearest attribution and keeps manual identity across equivalent or unrelated metadata changes', () => {
    metadata(document.body, { page: PAGE, hero: HERO });
    const boundary = document.createElement('section');
    metadata(boundary, { page: PAGE, hero: { ...HERO, entityId: 'inner' } });
    document.body.append(boundary);
    const element = root();
    boundary.append(element);
    const first = readManualViewKey(element);
    expect(first?.attribution.entityId).toBe('inner');
    metadata(boundary, {
      hero: { entityKind: 'ExperienceFragment', entityId: 'inner' },
      page: { ...PAGE, entityId: 'changed' },
    });
    element.setAttribute('data-ctfl-scopes', 'other page hero  ');
    expect(readManualViewKey(element)).toBe(first);
    metadata(boundary, { hero: { ...HERO, parentVariantId: 'new' } });
    const changed = readManualViewKey(element);
    expect(changed).not.toBe(first);
    expect(changed?.attribution).toEqual({ ...HERO, parentVariantId: 'new' });
  });
});
