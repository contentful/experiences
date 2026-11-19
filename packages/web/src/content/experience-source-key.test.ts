import { expect, it } from 'vitest';
import { getExperienceSourceKey } from './experience-source-key.js';
const resolve = { config: { components: {} }, metadata: { section: 'hero' } };
const key = (request: object, revision = 0) =>
  getExperienceSourceKey(
    { request: { experienceId: 'hero', ...request }, revision: [revision] },
    resolve,
    0,
    'fetch'
  );

it('normalizes structured query ordering and partitions visitor scopes', () => {
  expect(key({ parameters: { feed: { limit: 2, order: 'sys.id' } }, locale: 'en-US' })).toBe(
    key({ locale: 'en-US', parameters: { feed: { order: 'sys.id', limit: 2 } } })
  );
  expect(key({}, 1)).not.toBe(key({}, 2));
});

it('does not assign shared keys to events or opaque resolver metadata', () => {
  expect(key({ personalization: { events: [] } })).toBeUndefined();
  expect(
    getExperienceSourceKey(
      { request: { experienceId: 'hero' }, revision: [] },
      { ...resolve, metadata: { callback() {} } },
      0,
      'fetch'
    )
  ).toBeUndefined();
});
