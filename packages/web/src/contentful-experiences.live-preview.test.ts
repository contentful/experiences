import { completeProfile as profileFixture } from './test-fixtures/profile.js';
import { afterEach, expect, it, vi } from 'vitest';
import {
  ContentfulExperiences as Runtime,
  PROFILE_CACHE_KEY,
  ANONYMOUS_ID_COOKIE_LEGACY,
  ANONYMOUS_ID_COOKIE,
  type PreviewClient,
} from '@contentful/experiences-runtime';
import type { ExperiencePayload, PortableRenderPlan } from '@contentful/experiences-sdk-core';
import { ContentfulExperiences, type Config } from './contentful-experiences.js';
import { clearIdentityCookies, seedConsent } from './test-fixtures/consent.js';
import { deferred } from './test-fixtures/dom.js';

const resolve = { config: { components: {} } };
const plan: PortableRenderPlan = { nodes: [], metadata: {}, debug: false, diagnostics: [] };
const runtimes: ContentfulExperiences[] = [];
const initialUrl = window.location.href;
function runtime(config: Partial<Config> = {}) {
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
  window.history.replaceState(null, '', '?preview_session_id=session');
  let update = () => {};
  let data: ExperiencePayload | undefined;
  let error: Error | undefined;
  const unsubscribe = vi.fn();
  const client: PreviewClient = {
    getResult: () => ({ data, error }),
    subscribe: (next: () => void) => {
      update = next;
      return unsubscribe;
    },
    subscribeStatus: () => unsubscribe,
  };
  const createClient = vi.fn(() => client);
  const fetch = vi.fn(
    async () =>
      new globalThis.Response(
        JSON.stringify({
          sys: { type: 'Experience', id: 'hero' },
          nodes: [],
        })
      )
  );
  return {
    client,
    createClient,
    fetch,
    unsubscribe,
    config: {
      preview: { accessToken: 'preview', createClient, fetch },
    },
    emit(
      payload: ExperiencePayload = { sys: { type: 'Experience', id: 'hero' }, nodes: [] },
      failure?: Error
    ) {
      data = payload;
      error = failure;
      update();
    },
  };
}
afterEach(() => {
  runtimes.splice(0).forEach((sdk) => sdk.destroy());
  vi.restoreAllMocks();
  window.localStorage.clear();
  clearIdentityCookies();
  window.history.replaceState(null, '', initialUrl);
});

it.each([false, true])(
  'establishes policy immediately and uses the session only for its actual Experience (live: %s)',
  async (live) => {
    const f = preview();
    window.history.replaceState(null, '', '?preview_session_id=%20editor-session%20');
    const sdk = runtime({
      preview: { ...f.config.preview, createClient: live ? f.createClient : undefined },
    });
    const ordinary = vi.spyOn(Runtime.prototype, 'fetchExperience').mockResolvedValue(plan);
    expect(sdk.isPreview).toBe(true);
    expect(sdk.states.preview.current?.sessionId).toBe('editor-session');
    await expect(sdk.page()).resolves.toMatchObject({ accepted: false, reason: 'preview' });
    await sdk.fetchExperience({ experienceId: 'hero' }, resolve);
    expect(ordinary).not.toHaveBeenCalled();
    expect(sdk.states.profile.current).toBeUndefined();
    sdk.consent({ persistence: true });
    expect(sdk.states.persistenceConsent.current).toBe(true);
    expect(sdk.states.profile.current).toBeUndefined();
    expect(document.cookie).not.toContain(`${ANONYMOUS_ID_COOKIE}=`);
    await sdk.fetchExperience({ experienceId: 'other' }, resolve);
    expect(ordinary).toHaveBeenCalledTimes(1);
    expect(f.fetch).toHaveBeenCalled();
    if (!live) {
      expect(f.createClient).not.toHaveBeenCalled();
      expect(sdk.states.preview.current?.status).toBe('static');
    }
  }
);

it('isolates content fetches from failed live client creation', async () => {
  const f = preview();
  const ordinary = vi.spyOn(Runtime.prototype, 'fetchExperience').mockResolvedValue(plan);
  const createClient = vi.fn(() => {
    throw new Error('client unavailable');
  });
  const sdk = runtime({ preview: { ...f.config.preview, createClient } });
  await expect(sdk.fetchExperience({ experienceId: 'hero' }, resolve)).resolves.toEqual(plan);
  await vi.waitFor(() =>
    expect(sdk.states.preview.current?.error?.message).toBe('client unavailable')
  );
  await expect(sdk.fetchExperience({ experienceId: 'other' }, resolve)).resolves.toEqual(plan);
  await expect(sdk.fetchExperience({ experienceId: 'hero' }, resolve)).resolves.toEqual(plan);
  expect(createClient).toHaveBeenCalledOnce();
  expect(ordinary).toHaveBeenCalledTimes(1);
});

it('routes the one session stream only to listeners matching the payload Experience ID', async () => {
  const f = preview(),
    sdk = runtime(f.config);
  const hero = vi.fn(),
    footer = vi.fn();
  const first = sdk.subscribeToPreview('hero', resolve, hero);
  const second = sdk.subscribeToPreview('footer', resolve, footer);
  await vi.waitFor(() => expect(f.createClient).toHaveBeenCalledOnce());
  f.emit({ sys: { type: 'Experience' }, nodes: [] });
  f.emit();
  await vi.waitFor(() => expect(hero).toHaveBeenCalledOnce());
  expect(footer).not.toHaveBeenCalled();
  f.emit({ sys: { type: 'Experience', id: 'footer' }, nodes: [] });
  await vi.waitFor(() => expect(footer).toHaveBeenCalledOnce());
  expect(hero).toHaveBeenCalledOnce();
  expect(sdk.states.preview.current?.data?.sys?.id).toBe('footer');
  first.unsubscribe();
  second.unsubscribe();
  expect(f.unsubscribe).not.toHaveBeenCalled();
  expect(f.createClient).toHaveBeenCalledOnce();
  sdk.destroy();
  expect(f.unsubscribe).toHaveBeenCalledTimes(2);
});

it('delivers usable preview nodes and every resolver diagnostic', async () => {
  const f = preview(),
    sdk = runtime(f.config);
  const next = vi.fn();
  const subscription = sdk.subscribeToPreview('hero', resolve, next);
  await vi.waitFor(() => expect(f.createClient).toHaveBeenCalled());
  f.emit({
    sys: { type: 'Experience', id: 'hero' },
    extensions: {
      personalization: {
        profile: profileFixture('preview-profile'),
        changes: [
          {
            type: 'Variable',
            key: 'banner',
            value: false,
            meta: { experienceId: 'experiment', variantIndex: 0 },
          },
        ],
      },
    },
    nodes: [
      {
        component: {
          sys: {
            type: 'ResourceLink',
            linkType: 'Contentful:Component',
            urn: 'crn:contentful:::experience:spaces/$self/environments/$self/components/Heading',
          },
        },
        contentProperties: { text: 'fresh' },
      },
      {},
      {},
    ],
  } as ExperiencePayload);
  await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());
  const update = next.mock.calls[0]![0];
  expect(update.data.nodes).toHaveLength(1);
  expect(update.data.nodes[0].props.content.text).toBe('fresh');
  expect(update.data.diagnostics).toHaveLength(2);
  expect(update.error).toBeUndefined();
  expect(sdk.getFlag('banner')).toBe(false);
  expect(sdk.states.profile.current).toBeUndefined();
  subscription.unsubscribe();
});

it('coalesces equivalent fetches with independent plans and one profile adoption', async () => {
  const sdk = runtime({ locale: 'en-US' });
  const resolverError = new Error('resolver failed', { cause: () => {} });
  const resolveOptions = {
    config: {
      components: {
        Heading: {
          resolveData: () => {
            throw resolverError;
          },
        },
      },
    },
  };
  const source = await sdk.resolveExperience(
    {
      nodes: [
        {
          component: {
            sys: {
              type: 'ResourceLink',
              linkType: 'Contentful:Component',
              urn: 'crn:contentful:::experience:spaces/$self/environments/$self/components/Heading',
            },
          },
          contentProperties: { text: 'original' },
        },
      ],
    },
    resolveOptions
  );
  const fetch = vi
    .spyOn(Runtime.prototype, 'fetchExperience')
    .mockResolvedValue({ ...source, personalization: { profile: profileFixture('evaluated') } });
  const [first, second] = await Promise.all([
    sdk.fetchExperience({ experienceId: 'hero' }, resolveOptions),
    sdk.fetchExperience(
      { experienceId: 'hero', locale: 'en-US', extensions: { sourceMap: {} } },
      resolveOptions
    ),
  ]);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(sdk.states.profile.current?.id).toBe('evaluated');
  expect(first.diagnostics[0]).toBeInstanceOf(Error);
  expect(first.diagnostics[0]!.cause).toBe(resolverError);
  expect(first.diagnostics[0]!.stack).toBe(source.diagnostics[0]!.stack);
  first.diagnostics[0]!.message = 'changed';
  expect(second.diagnostics[0]!.message).toBe(source.diagnostics[0]!.message);
  first.nodes[0]!.props.content.text = 'changed';
  expect(second.nodes[0]!.props.content.text).toBe('original');
  expect(source.nodes[0]!.props.content.text).toBe('original');
  first.nodes.splice(0, 1);
  expect(second.nodes).toHaveLength(1);
  expect(source.nodes).toHaveLength(1);
});

it('releases preview subscriptions and ownership when tracking teardown throws', async () => {
  const f = preview(),
    sdk = runtime(f.config);
  await vi.waitFor(() => expect(f.createClient).toHaveBeenCalled());
  f.emit();
  expect(sdk.states.preview.current?.data).toBeDefined();
  vi.spyOn(MutationObserver.prototype, 'disconnect').mockImplementationOnce(() => {
    throw new Error('tracking teardown failed');
  });
  expect(() => sdk.destroy()).toThrow('tracking teardown failed');
  expect(f.unsubscribe).toHaveBeenCalledTimes(2);
  expect(sdk.states.preview.current).toBeUndefined();
  expect(() => runtime()).not.toThrow();
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
  await vi.waitFor(() => expect(f.createClient).toHaveBeenCalled());
  f.emit();
  await vi.waitFor(() => expect(resolvePlan).toHaveBeenCalledTimes(1));
  a.unsubscribe();
  const selected = {
    ...plan,
    personalization: {
      profile: profileFixture('preview-profile'),
      changes: [
        {
          type: 'Variable',
          key: 'banner',
          value: false,
          meta: { experienceId: 'experiment', variantIndex: 0 },
        },
      ],
    },
  };
  pending.resolve(selected);
  await vi.waitFor(() => expect(second).toHaveBeenCalledWith({ data: selected, error: undefined }));
  expect(sdk.getFlag('banner')).toBe(false);
  expect(first).not.toHaveBeenCalled();
  expect(f.fetch).not.toHaveBeenCalled();
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
  await vi.waitFor(() => expect(f.createClient).toHaveBeenCalled());
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
  window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profileFixture('visitor')));
  document.cookie = `${ANONYMOUS_ID_COOKIE_LEGACY}=visitor; Path=/`;
  const f = preview();
  const sdk = runtime({
    ...f.config,
    defaults: { persistenceConsent: false, profile: profileFixture('explicit') },
  });
  expect(sdk.states.persistenceConsent.current).toBe(false);
  expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
  expect(document.cookie).not.toContain(`${ANONYMOUS_ID_COOKIE_LEGACY}=`);
  sdk.consent({ persistence: true });
  expect(sdk.states.persistenceConsent.current).toBe(true);
  expect(sdk.states.profile.current?.id).toBe('explicit');
  expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
  expect(document.cookie).not.toContain(`${ANONYMOUS_ID_COOKIE}=`);
});
