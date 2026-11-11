import type { Profile } from '@contentful/optimization-api-client/api-schemas';

/**
 * A complete Personalization API profile, as the Personalization API returns it. Analytics requires a
 * complete profile, so tests that expect an Analytics event to be sent use this rather
 * than an id-only `{ id }`.
 */
export function completeProfile(id: string, overrides: Partial<Profile> = {}): Profile {
  return {
    id,
    stableId: id,
    random: 0.5,
    audiences: [],
    traits: {},
    location: {},
    session: {
      isReturningVisitor: false,
      landingPage: { path: '/', query: {}, referrer: '', search: '', url: 'https://example.com/' },
      count: 1,
      activeSessionLength: 0,
      averageSessionLength: 0,
    },
    ...overrides,
  };
}
