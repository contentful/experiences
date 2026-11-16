import type { Profile } from '@contentful/optimization-api-client/api-schemas';

/** A fresh complete profile; ID-only continuity remains an explicit test input. */
export function profileFixture(id = 'visitor', overrides: Partial<Profile> = {}): Profile {
  return {
    id,
    stableId: id,
    random: 0.5,
    audiences: [],
    traits: {},
    location: {},
    session: {
      id: 'session-1',
      isReturningVisitor: false,
      landingPage: {
        url: 'https://example.test/',
        path: '/',
        query: {},
        referrer: '',
        search: '',
      },
      count: 1,
      activeSessionLength: 0,
      averageSessionLength: 0,
    },
    ...overrides,
  };
}
