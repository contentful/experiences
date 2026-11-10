import { describe, expect, it } from 'vitest';

import {
  ANONYMOUS_ID_COOKIE,
  ANONYMOUS_ID_COOKIE_LEGACY,
  ANONYMOUS_ID_KEY,
  ANONYMOUS_ID_KEY_LEGACY,
  PROFILE_CACHE_KEY,
} from './constants.js';

// These names are a storage contract shared with the Optimization SDK. A different value
// would make the two SDKs ignore each other's cookie and storage, so each is pinned.
describe('profile persistence constants', () => {
  it('uses the Optimization SDK cookie name for server/browser continuity', () => {
    expect(ANONYMOUS_ID_COOKIE).toBe('ctfl-opt-aid');
  });

  it('uses the Optimization SDK legacy cookie name', () => {
    expect(ANONYMOUS_ID_COOKIE_LEGACY).toBe('ntaid');
  });

  it('uses the Optimization SDK profile cache key', () => {
    expect(PROFILE_CACHE_KEY).toBe('__ctfl_opt_profile__');
  });

  it('uses the Optimization SDK anonymous id storage keys', () => {
    expect(ANONYMOUS_ID_KEY).toBe('__ctfl_opt_anonymous_id__');
    expect(ANONYMOUS_ID_KEY_LEGACY).toBe('__nt_anonymous_id__');
  });
});
