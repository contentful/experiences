import { afterEach, expect, it, vi } from 'vitest';
import {
  ContentfulExperiences as Runtime,
  PROFILE_CACHE_KEY,
  ANONYMOUS_ID_COOKIE_LEGACY,
  type RuntimeLivePreviewModule,
} from '@contentful/experiences-runtime';
import type { ExperiencePayload, PortableRenderPlan } from '@contentful/experiences-sdk-core';
import { ContentfulExperiences, type ExperiencesWebConfig } from './contentful-experiences.js';
import { clearIdentityCookies, seedConsent } from './test-fixtures/consent.js';
import { deferred } from './test-fixtures/dom.js';

const resolve = { config: { components: {} } };
const plan: PortableRenderPlan = { nodes: [], metadata: {}, debug: false, diagnostics: [] };
const runtimes: ContentfulExperiences[] = [];
function runtime(config: Partial<ExperiencesWebConfig> = {}) {
  const sdk = new ContentfulExperiences({
    spaceId: 'space',
    environmentId: 'master',
    delivery: { accessToken: 'delivery' },
    ...config,
  });
  runtimes.push(sdk);
  return sdk;
}
function preview() {
  let update = () => {};
  let data: ExperiencePayload | undefined;
  const implementation: RuntimeLivePreviewModule = {
    fetchPreviewSession: vi.fn(async () => ({
      ...plan,
      personalization: { profileId: 'preview-profile' },
    })),
    createLivePreviewClient: vi.fn(() => ({
      getResult: () => ({ data, error: undefined }),
      subscribe: (next: () => void) => {
        update = next;
        return () => {};
      },
      subscribeStatus: () => () => {},
    })),
    sendPreviewStatus: vi.fn(),
  };
  return {
    implementation,
    config: {
      preview: { accessToken: 'preview' },
      livePreview: () => ({ experienceId: 'hero', sessionId: 'session', implementation }),
    },
    emit() {
      data = { sys: { type: 'Experience' }, nodes: [] };
      update();
    },
  };
}
afterEach(() => {
  runtimes.splice(0).forEach((sdk) => sdk.destroy());
  vi.restoreAllMocks();
  window.localStorage.clear();
  clearIdentityCookies();
});

it('establishes policy immediately and uses the session only for the bound Experience', async () => {
  const f = preview(),
    sdk = runtime(f.config);
  const ordinary = vi.spyOn(Runtime.prototype, 'fetchExperience').mockResolvedValue(plan);
  expect(sdk.isPreview).toBe(true);
  await expect(sdk.page()).resolves.toMatchObject({ accepted: false, reason: 'preview' });
  await sdk.fetchExperience({ experienceId: 'hero' }, resolve);
  expect(ordinary).not.toHaveBeenCalled();
  expect(sdk.states.profile.current).toBeUndefined();
  await sdk.fetchExperience({ experienceId: 'other' }, resolve);
  expect(ordinary).toHaveBeenCalledTimes(1);
  expect(f.implementation.fetchPreviewSession).toHaveBeenCalledTimes(1);
});

it('rejects failed initialization without falling back to ordinary delivery', async () => {
  const ordinary = vi.spyOn(Runtime.prototype, 'fetchExperience').mockResolvedValue(plan);
  const sdk = runtime({
    livePreview: async () => {
      throw new Error('module unavailable');
    },
  });
  await expect(sdk.fetchExperience({ experienceId: 'hero' }, resolve)).rejects.toThrow(
    'module unavailable'
  );
  expect(ordinary).not.toHaveBeenCalled();
});

it('coalesces equivalent ordinary fetches and commits their evaluated profile once', async () => {
  const fetch = vi
    .spyOn(Runtime.prototype, 'fetchExperience')
    .mockResolvedValue({ ...plan, personalization: { profileId: 'evaluated' } });
  const sdk = runtime({ locale: 'en-US' });
  await Promise.all([
    sdk.fetchExperience({ experienceId: 'hero' }, resolve),
    sdk.fetchExperience(
      { experienceId: 'hero', locale: 'en-US', preview: false, extensions: { sourceMap: {} } },
      resolve
    ),
  ]);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(sdk.states.profile.current?.id).toBe('evaluated');
});

it('shares preview resolution, does not fetch in the binding, and ignores detached consumers', async () => {
  const f = preview(),
    sdk = runtime(f.config);
  const pending = deferred<PortableRenderPlan>();
  const resolvePlan = vi
    .spyOn(Runtime.prototype, 'resolveExperience')
    .mockReturnValue(pending.promise);
  const first = vi.fn(),
    second = vi.fn();
  const a = sdk.subscribeToPreview('hero', resolve, first);
  const b = sdk.subscribeToPreview('hero', resolve, second);
  await vi.waitFor(() => expect(f.implementation.createLivePreviewClient).toHaveBeenCalled());
  f.emit();
  await vi.waitFor(() => expect(resolvePlan).toHaveBeenCalledTimes(1));
  a.unsubscribe();
  pending.resolve(plan);
  await vi.waitFor(() => expect(second).toHaveBeenCalledWith({ data: plan, error: undefined }));
  expect(first).not.toHaveBeenCalled();
  expect(f.implementation.fetchPreviewSession).not.toHaveBeenCalled();
  b.unsubscribe();
});

it('discards a pending preview resolution after reset', async () => {
  const f = preview(),
    sdk = runtime(f.config);
  const pending = deferred<PortableRenderPlan>();
  const resolvePlan = vi
    .spyOn(Runtime.prototype, 'resolveExperience')
    .mockReturnValue(pending.promise);
  const next = vi.fn(),
    subscription = sdk.subscribeToPreview('hero', resolve, next);
  await vi.waitFor(() => expect(f.implementation.createLivePreviewClient).toHaveBeenCalled());
  f.emit();
  await vi.waitFor(() => expect(resolvePlan).toHaveBeenCalled());
  sdk.reset();
  pending.resolve(plan);
  await pending.promise;
  expect(sdk.states.preview.current?.data).toBeUndefined();
  expect(next).not.toHaveBeenCalled();
  subscription.unsubscribe();
});

it('honors explicit startup persistence denial while preview never adopts visitor identity', () => {
  seedConsent({ events: true, persistence: true });
  window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ id: 'visitor' }));
  document.cookie = `${ANONYMOUS_ID_COOKIE_LEGACY}=visitor; Path=/`;
  const sdk = runtime({ isPreview: true, defaults: { persistenceConsent: false } });
  expect(sdk.states.persistenceConsent.current).toBe(false);
  expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
  expect(document.cookie).not.toContain(`${ANONYMOUS_ID_COOKIE_LEGACY}=`);
});
