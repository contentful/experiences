// @vitest-environment jsdom

import {
  ANONYMOUS_ID_COOKIE,
  ANONYMOUS_ID_COOKIE_LEGACY,
  ANONYMOUS_ID_KEY,
  ANONYMOUS_ID_KEY_LEGACY,
  PROFILE_CACHE_KEY,
  type ExperiencesHandoff,
} from '@contentful/experiences-runtime';
import { ExperienceApiClient } from '@contentful/optimization-api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContentfulExperiences } from './contentful-experiences.js';
import { getCookie, removeCookie, setCookie } from './lib/cookies.js';
import { seedConsent } from './test-fixtures/consent.js';

// The identity cookie is what lets a server recognise a visitor the browser SDK has
// identified. These cases follow the Optimization SDK's own lifecycle tests.

const runtimes = new Set<ContentfulExperiences>();

function createRuntime(
  config: Partial<ConstructorParameters<typeof ContentfulExperiences>[0]> = {}
): ContentfulExperiences {
  const runtime = new ContentfulExperiences({
    spaceId: 'space',
    environmentId: 'environment',
    locale: 'en-US',
    delivery: { accessToken: 'delivery-token' },
    ...config,
  });
  runtimes.add(runtime);
  return runtime;
}

function respondWith(profileId: string) {
  vi.mocked(ExperienceApiClient.prototype.upsertProfile).mockResolvedValue({
    profile: { id: profileId },
  } as never);
}

function handoff(overrides: Partial<ExperiencesHandoff> = {}): ExperiencesHandoff {
  return {
    spaceId: 'space',
    environmentId: 'environment',
    cache: { scope: 'private-request' },
    ...overrides,
  };
}

beforeEach(() => {
  // A fresh spy per test, so a test reads only the requests it made itself.
  vi.restoreAllMocks();
  vi.spyOn(ExperienceApiClient.prototype, 'upsertProfile').mockResolvedValue({
    profile: { id: 'api-profile' },
  } as never);
  window.localStorage.clear();
  removeCookie(ANONYMOUS_ID_COOKIE);
  removeCookie(ANONYMOUS_ID_COOKIE_LEGACY);
});

afterEach(() => {
  for (const runtime of runtimes) runtime.destroy();
  runtimes.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('writing the identity', () => {
  it('writes the cookie and stored id for a profile when persistence is granted', () => {
    seedConsent({ events: true, persistence: true });

    createRuntime({ defaults: { profile: { id: 'visitor-1' } } });

    expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('visitor-1');
    expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBe('visitor-1');
  });

  it('does not write the cookie or stored id when persistence is undecided', () => {
    createRuntime({ defaults: { profile: { id: 'visitor-1' } } });

    expect(getCookie(ANONYMOUS_ID_COOKIE)).toBeUndefined();
    expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBeNull();
  });

  it('does not write the cookie or stored id when persistence is denied', () => {
    seedConsent({ events: true, persistence: false });

    createRuntime({ defaults: { profile: { id: 'visitor-1' } } });

    expect(getCookie(ANONYMOUS_ID_COOKIE)).toBeUndefined();
    expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBeNull();
  });

  it('keeps the in-memory profile when persistence is denied', () => {
    seedConsent({ events: true, persistence: false });

    const runtime = createRuntime({ defaults: { profile: { id: 'visitor-1' } } });

    expect(runtime.states.profile.current).toEqual({ id: 'visitor-1' });
  });

  it('writes the identity from a profile-producing response', async () => {
    seedConsent({ events: true, persistence: true });
    respondWith('response-profile');
    const runtime = createRuntime();

    await runtime.page();

    expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('response-profile');
    expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBe('response-profile');
  });

  it('writes the identity from an XDA profile id on a fetched plan', async () => {
    seedConsent({ events: true, persistence: true });
    const runtime = createRuntime();
    vi.spyOn(
      Object.getPrototypeOf(ContentfulExperiences.prototype) as {
        fetchExperience: ContentfulExperiences['fetchExperience'];
      },
      'fetchExperience'
    ).mockResolvedValue({ nodes: [], personalization: { profileId: 'xda-profile' } } as never);

    await runtime.fetchExperience({ experienceId: 'landing' }, { config: { components: {} } });

    expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('xda-profile');
    expect(runtime.states.profile.current).toEqual({ id: 'xda-profile' });
    expect(JSON.parse(window.localStorage.getItem(PROFILE_CACHE_KEY)!)).toEqual({
      id: 'xda-profile',
    });
  });

  it('applies the configured cookie scope', () => {
    seedConsent({ events: true, persistence: true });
    const writes: string[] = [];
    const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')!;
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => '',
      set: (value: string) => {
        writes.push(value);
      },
    });

    createRuntime({
      defaults: { profile: { id: 'visitor-1' } },
      cookie: { domain: 'example.com', path: '/shop', sameSite: 'lax', secure: true, expires: 7 },
    });
    Reflect.deleteProperty(document, 'cookie');
    Object.defineProperty(Document.prototype, 'cookie', descriptor);

    expect(writes[0]).toMatch(
      /^ctfl-opt-aid=visitor-1; Path=\/shop; Domain=example\.com; SameSite=lax; Secure; Expires=/
    );
  });
});

describe('deleting the identity in the scope it was written in', () => {
  function recordCookieWrites() {
    const writes: string[] = [];
    const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')!;
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => '',
      set: (value: string) => {
        writes.push(value);
      },
    });
    return {
      writes,
      restore: () => {
        Reflect.deleteProperty(document, 'cookie');
        Object.defineProperty(Document.prototype, 'cookie', descriptor);
      },
    };
  }

  const scope = { domain: 'example.com', path: '/shop', sameSite: 'none', secure: true } as const;
  const scopeText = 'Path=/shop; Domain=example.com; SameSite=none; Secure';

  it('withdrawing persistence deletes the cookie with the configured scope', () => {
    seedConsent({ events: true, persistence: true });
    const { writes, restore } = recordCookieWrites();
    const runtime = createRuntime({ defaults: { profile: { id: 'visitor-1' } }, cookie: scope });

    runtime.consent({ persistence: false });
    restore();

    const deletions = writes.filter((write) => write.includes('Expires=Thu, 01 Jan 1970'));
    expect(deletions.length).toBeGreaterThan(0);
    expect(deletions.every((write) => write.includes(scopeText))).toBe(true);
  });

  it('reset() deletes the cookie with the configured scope', () => {
    seedConsent({ events: true, persistence: true });
    const { writes, restore } = recordCookieWrites();
    const runtime = createRuntime({ defaults: { profile: { id: 'visitor-1' } }, cookie: scope });

    runtime.reset();
    restore();

    const deletions = writes.filter((write) => write.includes('Expires=Thu, 01 Jan 1970'));
    expect(deletions.length).toBeGreaterThan(0);
    expect(deletions.every((write) => write.includes(scopeText))).toBe(true);
  });
});

describe('adopting an identity the browser already holds', () => {
  it('adopts a server cookie at startup when persistence is granted', async () => {
    seedConsent({ events: true, persistence: true });
    setCookie(ANONYMOUS_ID_COOKIE, 'server-id');

    const runtime = createRuntime();
    expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBe('server-id');
    await runtime.page();

    // The first request carries the identity the server wrote.
    expect(vi.mocked(ExperienceApiClient.prototype.upsertProfile).mock.calls[0]![0].profileId).toBe(
      'server-id'
    );
    // The response's profile is then the authoritative identity, as in the Optimization SDK.
    expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('api-profile');
  });

  it('does not adopt a server cookie at startup when persistence is undecided', async () => {
    setCookie(ANONYMOUS_ID_COOKIE, 'server-id');

    const runtime = createRuntime();
    await runtime.page();

    expect(
      vi.mocked(ExperienceApiClient.prototype.upsertProfile).mock.calls[0]![0].profileId
    ).toBeUndefined();
    expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBeNull();
  });

  it('adopts a server cookie when persistence is granted after initialization', async () => {
    setCookie(ANONYMOUS_ID_COOKIE, 'server-id');
    const runtime = createRuntime();
    expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBeNull();

    runtime.consent({ persistence: true });
    expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBe('server-id');
    expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('server-id');
    await runtime.page();

    expect(vi.mocked(ExperienceApiClient.prototype.upsertProfile).mock.calls[0]![0].profileId).toBe(
      'server-id'
    );
  });

  it('writes an identity already held in memory when persistence is granted later', () => {
    const runtime = createRuntime({ defaults: { profile: { id: 'visitor-1' } } });
    expect(getCookie(ANONYMOUS_ID_COOKIE)).toBeUndefined();

    runtime.consent({ persistence: true });

    expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('visitor-1');
    expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBe('visitor-1');
  });

  it('migrates a legacy cookie when persistence is granted after initialization', () => {
    setCookie(ANONYMOUS_ID_COOKIE_LEGACY, 'legacy-id');
    const runtime = createRuntime();

    runtime.consent({ persistence: true });

    expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBe('legacy-id');
    expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('legacy-id');
    expect(getCookie(ANONYMOUS_ID_COOKIE_LEGACY)).toBeUndefined();
  });

  it('keeps the matching profile when the server cookie is the same identity', () => {
    seedConsent({ events: true, persistence: true });
    setCookie(ANONYMOUS_ID_COOKIE, 'server-id');

    const runtime = createRuntime({ defaults: { profile: { id: 'server-id' } } });

    expect(runtime.states.profile.current).toEqual({ id: 'server-id' });
    expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('server-id');
  });

  it('replaces a profile that belongs to a different identity than the server cookie', () => {
    seedConsent({ events: true, persistence: true });
    window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ id: 'old-visitor' }));
    setCookie(ANONYMOUS_ID_COOKIE, 'server-id');

    const runtime = createRuntime();

    expect(runtime.states.profile.current).toBeUndefined();
    expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('server-id');
  });
});

describe('reconciling a server cookie with the identity held', () => {
  /** Records every write to the cookie jar and to the stored anonymous id. */
  function recordWrites() {
    const cookieWrites: string[] = [];
    const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')!;
    const jar = document.cookie;
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => jar,
      set: (value: string) => {
        cookieWrites.push(value);
      },
    });
    const setItem = vi.spyOn(window.Storage.prototype, 'setItem');
    const removeItem = vi.spyOn(window.Storage.prototype, 'removeItem');
    return {
      cookieWrites,
      storedIdWrites: () =>
        [...setItem.mock.calls, ...removeItem.mock.calls].filter(
          ([key]) => key === ANONYMOUS_ID_KEY
        ),
      restore: () => {
        Reflect.deleteProperty(document, 'cookie');
        Object.defineProperty(Document.prototype, 'cookie', descriptor);
      },
    };
  }

  it('reconciles the cookie before persisting the profile, then restores the captured cookie as Optimization does', () => {
    seedConsent({ events: true, persistence: true });
    window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ id: 'old-visitor' }));
    setCookie(ANONYMOUS_ID_COOKIE, 'server-id');
    const { cookieWrites, restore } = recordWrites();

    const runtime = createRuntime();
    restore();

    expect(runtime.states.profile.current).toBeUndefined();
    const identityWrites = cookieWrites
      .map((write) => write.split(';')[0] ?? '')
      .filter((write) => write.startsWith('ctfl-opt-aid='));
    // Optimization registers its persistence-consent effect before its profile effect.
    // The conflicting profile is reset before it can be persisted; the profile effect
    // then synchronizes the incoming visitor's identity.
    expect(identityWrites).toEqual([
      'ctfl-opt-aid=',
      'ctfl-opt-aid=server-id',
      'ctfl-opt-aid=server-id',
    ]);
    expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBe('server-id');
  });

  it('refreshes the cookie once when it already matches the stored id and the profile, as Optimization does', () => {
    seedConsent({ events: true, persistence: true });
    window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ id: 'server-id' }));
    window.localStorage.setItem(ANONYMOUS_ID_KEY, 'server-id');
    setCookie(ANONYMOUS_ID_COOKIE, 'server-id');
    const { cookieWrites, restore } = recordWrites();

    createRuntime();
    restore();

    // Reconciliation finds nothing to change; the profile synchronization then refreshes expiry.
    expect(cookieWrites.map((write) => write.split(';')[0])).toEqual(['ctfl-opt-aid=server-id']);
  });

  it('writes the active profile over a different stored identity when persistence is granted later', () => {
    setCookie(ANONYMOUS_ID_COOKIE, 'cookie-id');
    window.localStorage.setItem(ANONYMOUS_ID_KEY, 'cookie-id');
    const runtime = createRuntime({ defaults: { profile: { id: 'profile-id' } } });
    expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('cookie-id');

    runtime.consent({ persistence: true });

    expect(runtime.states.profile.current).toEqual({ id: 'profile-id' });
    expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('profile-id');
    expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBe('profile-id');
  });

  it('restores the incoming cookie identity over a conflicting configured profile at startup', () => {
    seedConsent({ events: true, persistence: true });
    setCookie(ANONYMOUS_ID_COOKIE, 'cookie-id');
    window.localStorage.setItem(ANONYMOUS_ID_KEY, 'cookie-id');

    const runtime = createRuntime({ defaults: { profile: { id: 'profile-id' } } });

    // The incoming cookie was captured before the profile could overwrite it.
    expect(runtime.states.profile.current).toBeUndefined();
    expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('cookie-id');
    expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBe('cookie-id');
  });

  it('restores the incoming cookie identity over a conflicting persisted profile at startup', () => {
    seedConsent({ events: true, persistence: true });
    setCookie(ANONYMOUS_ID_COOKIE, 'cookie-id');
    window.localStorage.setItem(ANONYMOUS_ID_KEY, 'cookie-id');
    window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ id: 'profile-id' }));

    const runtime = createRuntime();

    expect(runtime.states.profile.current).toBeUndefined();
    expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('cookie-id');
    expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBe('cookie-id');
    expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
  });

  it('keeps a configured profile that matches the incoming cookie at startup', () => {
    seedConsent({ events: true, persistence: true });
    setCookie(ANONYMOUS_ID_COOKIE, 'same-id');
    window.localStorage.setItem(ANONYMOUS_ID_KEY, 'same-id');

    const runtime = createRuntime({ defaults: { profile: { id: 'same-id' } } });

    expect(runtime.states.profile.current).toEqual({ id: 'same-id' });
    expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('same-id');
  });

  it('migrates a legacy cookie to the current one, then synchronizes the effective identity', () => {
    seedConsent({ events: true, persistence: true });
    setCookie(ANONYMOUS_ID_COOKIE_LEGACY, 'legacy-id');
    window.localStorage.setItem(ANONYMOUS_ID_KEY, 'legacy-id');
    const { cookieWrites, restore } = recordWrites();

    createRuntime();
    restore();

    const written = cookieWrites.filter((write) => write.startsWith('ctfl-opt-aid=legacy-id'));
    // Initial consent reconciliation, profile persistence, then the captured legacy cookie.
    expect(written).toHaveLength(3);
  });
});

describe('withdrawing persistence consent', () => {
  it('removes the cookie and stored id but keeps the in-memory profile', () => {
    seedConsent({ events: true, persistence: true });
    const runtime = createRuntime({ defaults: { profile: { id: 'visitor-1' } } });
    expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('visitor-1');

    runtime.consent({ persistence: false });

    expect(getCookie(ANONYMOUS_ID_COOKIE)).toBeUndefined();
    expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBeNull();
    expect(runtime.states.profile.current).toEqual({ id: 'visitor-1' });
  });

  it('removes the legacy cookie too', () => {
    seedConsent({ events: true, persistence: true });
    const runtime = createRuntime({ defaults: { profile: { id: 'visitor-1' } } });
    setCookie(ANONYMOUS_ID_COOKIE_LEGACY, 'visitor-1');

    runtime.consent({ persistence: false });

    expect(getCookie(ANONYMOUS_ID_COOKIE_LEGACY)).toBeUndefined();
  });

  it('leaves event consent independent', async () => {
    seedConsent({ events: true, persistence: true });
    const runtime = createRuntime({ defaults: { profile: { id: 'visitor-1' } } });

    runtime.consent({ persistence: false });

    await expect(runtime.track({ event: 'purchase' })).resolves.toMatchObject({ accepted: true });
  });

  it('does not recreate the identity from a response that completes afterwards', async () => {
    seedConsent({ events: true, persistence: true });
    let finish!: (value: unknown) => void;
    vi.mocked(ExperienceApiClient.prototype.upsertProfile).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }) as never
    );
    const runtime = createRuntime({ defaults: { profile: { id: 'visitor-1' } } });

    const pending = runtime.track({ event: 'in-flight' });
    await vi.waitFor(() => expect(ExperienceApiClient.prototype.upsertProfile).toHaveBeenCalled());
    runtime.consent({ persistence: false });
    finish({ profile: { id: 'late-profile' } });
    await pending;

    expect(getCookie(ANONYMOUS_ID_COOKIE)).toBeUndefined();
    expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBeNull();
  });

  it('does not recreate the identity from a response that completes after event withdrawal', async () => {
    seedConsent({ events: true, persistence: true });
    let finish!: (value: unknown) => void;
    vi.mocked(ExperienceApiClient.prototype.upsertProfile).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }) as never
    );
    const runtime = createRuntime({ defaults: { profile: { id: 'visitor-1' } } });

    const pending = runtime.track({ event: 'in-flight' });
    await vi.waitFor(() => expect(ExperienceApiClient.prototype.upsertProfile).toHaveBeenCalled());
    runtime.consent({ events: false });
    finish({ profile: { id: 'late-profile' } });
    await pending;

    // The live profile and its identity stay as they were; the late response changes neither.
    expect(runtime.states.profile.current).toEqual({ id: 'visitor-1' });
    expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('visitor-1');
  });
});

describe('startup defaults', () => {
  it('writes the identity when a default grants persistence', () => {
    createRuntime({ defaults: { profile: { id: 'visitor-1' }, consent: true } });

    expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('visitor-1');
  });

  it('removes a stored identity when a default denies persistence', () => {
    seedConsent({ events: true, persistence: true });
    setCookie(ANONYMOUS_ID_COOKIE, 'visitor-1');
    window.localStorage.setItem(ANONYMOUS_ID_KEY, 'visitor-1');

    createRuntime({ defaults: { persistenceConsent: false } });

    expect(getCookie(ANONYMOUS_ID_COOKIE)).toBeUndefined();
    expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBeNull();
  });
});

describe('handoff identity', () => {
  it('writes the profile a private handoff carries', async () => {
    seedConsent({ events: true, persistence: true });
    const runtime = createRuntime();

    await runtime.hydrateHandoffState(handoff({ state: { profile: { id: 'server-profile' } } }), {
      routeKey: '/first',
    });

    expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('server-profile');
    expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBe('server-profile');
  });

  it('writes the identity a handoff carries when it replays the page and no profile exists yet', async () => {
    seedConsent({ events: true, persistence: true });
    const runtime = createRuntime();

    await runtime.hydrateAndTrackCurrentPage(handoff({ profileId: 'server-profile' }), {
      routeKey: '/first',
    });

    expect(vi.mocked(ExperienceApiClient.prototype.upsertProfile).mock.calls[0]![0].profileId).toBe(
      'server-profile'
    );
  });

  it('does not write a handoff identity without persistence consent', async () => {
    const runtime = createRuntime();

    await runtime.hydrateHandoffState(handoff({ state: { profile: { id: 'server-profile' } } }), {
      routeKey: '/first',
    });

    expect(getCookie(ANONYMOUS_ID_COOKIE)).toBeUndefined();
  });

  it.each([
    ['static', { scope: 'static' }],
    ['public permutation', { scope: 'public-permutation', key: 'variant-a' }],
  ] as const)(
    'does not let a profileless %s handoff erase an existing identity',
    async (_name, cache) => {
      seedConsent({ events: true, persistence: true });
      const runtime = createRuntime({ defaults: { profile: { id: 'visitor-1' } } });

      await runtime.hydrateHandoffState(handoff({ cache }), {
        routeKey: '/first',
      });

      expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('visitor-1');
      expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBe('visitor-1');
    }
  );

  it.each([
    ['static', { scope: 'static' }],
    ['public permutation', { scope: 'public-permutation', key: 'variant-a' }],
  ] as const)(
    'keeps an identity held only in storage when a profileless %s handoff arrives',
    async (_name, cache) => {
      seedConsent({ events: true, persistence: true });
      // A returning visitor: the cookie and stored id exist, but no profile is in memory yet.
      setCookie(ANONYMOUS_ID_COOKIE, 'visitor-1');
      window.localStorage.setItem(ANONYMOUS_ID_KEY, 'visitor-1');
      const runtime = createRuntime();
      expect(runtime.states.profile.current).toBeUndefined();

      await runtime.hydrateAndTrackCurrentPage(handoff({ cache }), { routeKey: '/first' });

      expect(getCookie(ANONYMOUS_ID_COOKIE)).not.toBeUndefined();
      expect(
        vi.mocked(ExperienceApiClient.prototype.upsertProfile).mock.calls[0]![0].profileId
      ).toBe('visitor-1');
    }
  );

  it('does not replace an existing identity with a different one carried by a handoff', async () => {
    seedConsent({ events: true, persistence: true });
    const runtime = createRuntime({ defaults: { profile: { id: 'visitor-1' } } });

    await runtime.hydrateAndTrackCurrentPage(handoff({ profileId: 'someone-else' }), {
      routeKey: '/first',
    });

    // The held identity is what the request is sent under, not the handoff's.
    expect(vi.mocked(ExperienceApiClient.prototype.upsertProfile).mock.calls[0]![0].profileId).toBe(
      'visitor-1'
    );
  });
});

describe('the effective identity when only the stored id is held', () => {
  // A returning visitor: the cookie and stored id exist, but no complete profile is in memory.
  function returningVisitor() {
    seedConsent({ events: true, persistence: true });
    setCookie(ANONYMOUS_ID_COOKIE, 'visitor-1');
    window.localStorage.setItem(ANONYMOUS_ID_KEY, 'visitor-1');
    return createRuntime();
  }

  function spyOnFetch() {
    return vi
      .spyOn(
        Object.getPrototypeOf(ContentfulExperiences.prototype) as {
          fetchExperience: ContentfulExperiences['fetchExperience'];
        },
        'fetchExperience'
      )
      .mockResolvedValue({ nodes: [] } as never);
  }

  it('is not replaced by the identity an incoming handoff carries', async () => {
    const runtime = returningVisitor();
    expect(runtime.states.profile.current).toBeUndefined();

    await runtime.hydrateAndTrackCurrentPage(handoff({ profileId: 'someone-else' }), {
      routeKey: '/first',
    });

    expect(vi.mocked(ExperienceApiClient.prototype.upsertProfile).mock.calls[0]![0].profileId).toBe(
      'visitor-1'
    );
  });

  it('is sent with the first fetch', async () => {
    const runtime = returningVisitor();
    const fetch = spyOnFetch();

    await runtime.fetchExperience({ experienceId: 'landing' }, { config: { components: {} } });

    expect(fetch.mock.calls[0]![0].personalization?.profileId).toBe('visitor-1');
  });

  it('yields to an explicit profile on the fetch call', async () => {
    const runtime = returningVisitor();
    const fetch = spyOnFetch();

    await runtime.fetchExperience(
      { experienceId: 'landing', personalization: { profileId: 'explicit' } },
      { config: { components: {} } }
    );

    expect(fetch.mock.calls[0]![0].personalization?.profileId).toBe('explicit');
  });

  it('is not sent when persistence is not granted', async () => {
    setCookie(ANONYMOUS_ID_COOKIE, 'visitor-1');
    window.localStorage.setItem(ANONYMOUS_ID_KEY, 'visitor-1');
    const runtime = createRuntime();
    const fetch = spyOnFetch();

    await runtime.fetchExperience({ experienceId: 'landing' }, { config: { components: {} } });

    expect(fetch.mock.calls[0]![0].personalization?.profileId).toBeUndefined();
  });
});

describe('clearing a legacy stored identity', () => {
  it('removes a legacy-only stored id when startup defaults deny persistence, so a later grant does not revive it', () => {
    seedConsent({ events: true, persistence: true });
    window.localStorage.setItem(ANONYMOUS_ID_KEY_LEGACY, 'legacy-id');
    const runtime = createRuntime({ defaults: { persistenceConsent: false } });

    expect(window.localStorage.getItem(ANONYMOUS_ID_KEY_LEGACY)).toBeNull();
    runtime.consent({ persistence: true });

    expect(getCookie(ANONYMOUS_ID_COOKIE)).toBeUndefined();
    expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBeNull();
  });

  it('removes a legacy-only stored id when persistence is withdrawn', () => {
    seedConsent({ events: true, persistence: true });
    const runtime = createRuntime();
    window.localStorage.setItem(ANONYMOUS_ID_KEY_LEGACY, 'legacy-id');

    runtime.consent({ persistence: false });
    runtime.consent({ persistence: true });

    expect(getCookie(ANONYMOUS_ID_COOKIE)).toBeUndefined();
  });

  it('removes a legacy-only stored id on reset(), so a later grant does not revive it', () => {
    seedConsent({ events: true, persistence: true });
    const runtime = createRuntime();
    window.localStorage.setItem(ANONYMOUS_ID_KEY_LEGACY, 'legacy-id');

    runtime.reset();
    runtime.consent({ persistence: true });

    expect(window.localStorage.getItem(ANONYMOUS_ID_KEY_LEGACY)).toBeNull();
    expect(getCookie(ANONYMOUS_ID_COOKIE)).toBeUndefined();
  });
});

describe('reset and destroy', () => {
  it('reset() clears the cookie, the stored id and the stored profile', () => {
    seedConsent({ events: true, persistence: true });
    const runtime = createRuntime({ defaults: { profile: { id: 'visitor-1' } } });
    expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('visitor-1');

    runtime.reset();

    expect(getCookie(ANONYMOUS_ID_COOKIE)).toBeUndefined();
    expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBeNull();
    expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
  });

  it('destroy() leaves the approved identity in place', () => {
    seedConsent({ events: true, persistence: true });
    const runtime = createRuntime({ defaults: { profile: { id: 'visitor-1' } } });

    runtime.destroy();

    expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('visitor-1');
    expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBe('visitor-1');
    expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).not.toBeNull();
  });

  it('does not recreate the identity from a response that completes after reset()', async () => {
    seedConsent({ events: true, persistence: true });
    let finish!: (value: unknown) => void;
    vi.mocked(ExperienceApiClient.prototype.upsertProfile).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }) as never
    );
    const runtime = createRuntime({ defaults: { profile: { id: 'visitor-1' } } });

    const pending = runtime.track({ event: 'in-flight' });
    await vi.waitFor(() => expect(ExperienceApiClient.prototype.upsertProfile).toHaveBeenCalled());
    runtime.reset();
    finish({ profile: { id: 'late-profile' } });
    await pending;

    expect(getCookie(ANONYMOUS_ID_COOKIE)).toBeUndefined();
    expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBeNull();
  });
});
