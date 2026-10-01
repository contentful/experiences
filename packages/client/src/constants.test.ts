import { describe, expect, it } from 'vitest';

import { ANONYMOUS_ID_COOKIE, PROFILE_CACHE_KEY } from './constants.js';

describe('profile persistence constants', () => {
  it('uses the Optimization SDK cookie name for server/browser continuity', () => {
    expect(ANONYMOUS_ID_COOKIE).toBe('ctfl-opt-aid');
  });

  it('uses the Optimization SDK profile cache key', () => {
    expect(PROFILE_CACHE_KEY).toBe('__ctfl_opt_profile__');
  });
});
