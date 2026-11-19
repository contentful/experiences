import { describe, expect, it, vi } from 'vitest';
import { resolveExperience, type PortableRenderPlan } from '@contentful/experiences-sdk-core';
import { ExperienceFetchError } from '@contentful/experiences-client';
import type { ContentfulExperiences } from '@contentful/experiences-web';
import { createPresentation } from './presentation.svelte.js';
import { createPrimarySource } from './primary-source.svelte.js';
import type { PageSequence } from '../runtime/page-sequence.svelte.js';
import type { SourceOptions, ManagedExperienceOperationResult } from './source-types.js';
import { componentNode, dt } from '../test/fixtures/render-plan.js';

const plan = (experienceId = 'a'): PortableRenderPlan => ({
  experienceId,
  nodes: [],
  metadata: {},
  debug: false,
  diagnostics: [],
});
function setup(initialPlan?: PortableRenderPlan) {
  const profile: { current: { id: string } | undefined } = { current: undefined };
  const locale = { current: 'en-US' };
  const preview = vi.fn((_id: string, _resolve: unknown, _listener: (value: unknown) => void) => ({
    unsubscribe: vi.fn(),
  }));
  const fetch = vi.fn().mockResolvedValue(plan());
  const sdk = {
    captureLifetime: () => () => true,
    fetchExperience: fetch,
    subscribeToPreview: preview,
    locale: 'en-US',
    environmentId: 'master',
    isPreview: false,
    states: { profile },
  } as unknown as ContentfulExperiences;
  const options: SourceOptions = {
    request: { experienceId: 'a' },
    resolve: { config: { components: {} } },
    initialPlan,
  };
  let currentOptions = options;
  let currentSdk: ContentfulExperiences | undefined = sdk;
  const route = {
    revision: {},
    routeKey: '/',
    isCurrent: () => true,
    fetchExperience: ((_sdk, request, resolve) =>
      fetch(request, resolve)) as PageSequence['fetchExperience'],
    abandonPresentation: vi.fn(),
  } as unknown as PageSequence;
  const presentation = createPresentation<ManagedExperienceOperationResult>(() => source.refresh());
  const source = createPrimarySource({
    presentation,
    getSdk: () => currentSdk,
    getLocale: () => locale.current,
    route,
  });
  let registration: ReturnType<typeof source.attach> | undefined;
  const select = (next: SourceOptions) => {
    currentOptions = next;
    if (registration) registration.update();
    else registration = source.attach(() => currentOptions);
  };
  const setSdk = (next: ContentfulExperiences | undefined) => {
    currentSdk = next;
  };
  return {
    presentation,
    source,
    select,
    options,
    fetch,
    preview,
    profile,
    locale,
    sdk,
    route,
    setSdk,
  };
}

const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('managed content source', () => {
  it.each([
    { experienceId: 'a', parameters: {} },
    { destinationId: 'd', path: '/' },
    { destinationId: 'd', nodeId: 'n', parameters: undefined },
  ])('accepts each selector family and reuses seeded successful empty content', (request) => {
    const { source, select, options, fetch } = setup(plan());
    select({ ...options, request });
    expect(source.current.status).toBe('success');
    expect(source.current.data?.nodes).toEqual([]);
    expect(source.current.result?.plan).toBe(options.initialPlan);
    expect(fetch).not.toHaveBeenCalled();
    select({ ...options, request: { experienceId: 'next' } });
    expect(source.current.data).toBeUndefined();
    source.dispose();
  });

  describe.each(['fetch', 'seed'] as const)('%s error outcomes', (mode) => {
    it.each([
      { error: new TypeError('Failed to fetch'), authoritative: false },
      {
        error: new ExperienceFetchError('Delivery denied', {
          spaceId: 'space',
          experienceId: 'a',
          cause: { statusCode: 403 },
        }),
        authoritative: true,
      },
      {
        error: Object.assign(new Error('Missing Experience'), {
          name: 'NotFoundError',
          statusCode: 404,
        }),
        authoritative: true,
        notFound: true,
      },
      {
        error: Object.assign(new Error('Missing theme token'), { statusCode: 404 }),
        authoritative: mode === 'seed',
        notFound: mode === 'seed',
        resolveToken: true,
      },
      {
        error: new Error('Missing theme token', { cause: { statusCode: 404 } }),
        authoritative: false,
        resolveToken: true,
      },
      {
        error: Object.assign(new Error('Session unavailable'), {
          name: 'PreviewSessionFetchError',
          statusCode: 404,
        }),
        authoritative: false,
      },
    ])('keeps acquisition authority distinct from application failure: $error', async (outcome) => {
      const seeded = plan();
      const { source, select, options, fetch } = setup(seeded);
      if (mode === 'seed') select({ ...options, initialError: outcome.error });
      else {
        select(options);
        fetch.mockImplementationOnce(() => {
          if (!outcome.resolveToken) return Promise.reject(outcome.error);
          return resolveExperience(
            { nodes: [componentNode('theme', { designProperties: { color: dt('brand') } })] },
            {
              components: {},
              resolveToken: () => {
                throw outcome.error;
              },
            }
          );
        });
        await source.refresh();
      }
      expect(source.current.status).toBe('error');
      expect(source.current.data).toBe(outcome.authoritative ? undefined : seeded);
      expect(source.current.result?.plan).toBe(
        mode === 'seed' && !outcome.authoritative ? seeded : undefined
      );
      expect(source.current.error).toBe(outcome.error);
      expect(source.current.result?.error).toBe(outcome.error);
      expect(source.current.result?.notFound).toBe(outcome.notFound ? true : undefined);
      expect(fetch).toHaveBeenCalledTimes(mode === 'seed' ? 0 : 1);
      source.dispose();
    });
  });

  it('retains exact completed content across profile changes and failed reads, then accepts recovery', async () => {
    const { presentation, source, select, options, fetch, profile } = setup(plan());
    profile.current = { id: 'before' };
    select(options);
    const displayed = source.current.data;
    fetch.mockImplementationOnce(async () => {
      profile.current = { id: 'after' };
      throw new TypeError('Failed to fetch');
    });
    await source.refresh();
    expect(source.current.data).toBe(displayed);
    const adopted = plan('adopted');
    fetch.mockImplementationOnce(async () => {
      profile.current = { id: 'adopted' };
      return adopted;
    });
    await source.retry();
    expect(source.current.data).toBe(adopted);
    expect(presentation.isCurrentSnapshot(source.current)).toBe(true);
    source.dispose();
  });

  it.each(['selector', 'locale', 'route', 'session'] as const)(
    'clears inapplicable content and discards superseded %s completions',
    async (change) => {
      const { presentation, source, select, options, fetch, sdk, locale, route, setSdk } =
        setup(plan());
      select(options);
      let finish!: (value: PortableRenderPlan) => void;
      fetch.mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        })
      );
      const pending = source.refresh();
      const rollback = presentation.begin(() => true);
      if (change === 'locale') {
        Object.defineProperty(sdk, 'locale', { value: 'de-DE' });
        locale.current = 'de-DE';
      }
      if (change === 'route') Object.assign(route, { revision: {} });
      if (change === 'session') setSdk({ ...sdk } as ContentfulExperiences);
      fetch.mockResolvedValueOnce(plan('b'));
      select(change === 'selector' ? { ...options, request: { experienceId: 'b' } } : options);
      expect(source.current.data).toBeUndefined();
      const successor = source.current;
      rollback();
      expect(source.current).toBe(successor);
      await settle();
      finish(plan('old'));
      await pending;
      expect(source.current.data?.experienceId).toBe('b');
      const completed = source.current;
      rollback();
      expect(source.current).toBe(completed);
      source.dispose();
    }
  );

  it('uses one matching Preview subscription, supersedes pending fetches with live content and detaches', async () => {
    const { source, select, options, preview, fetch, sdk } = setup(plan());
    Object.defineProperty(sdk, 'isPreview', { value: true });
    select(options);
    const acquisitionError = Object.assign(new Error('Snapshot unavailable'), {
      name: 'PreviewSessionFetchError',
      statusCode: 404,
      cause: { statusCode: 404 },
    });
    fetch.mockRejectedValueOnce(acquisitionError);
    await source.refresh();
    expect(source.current.data).toBe(options.initialPlan);
    expect(source.current.result?.error).toBe(acquisitionError);
    expect(source.current.result?.notFound).toBeUndefined();
    select({ ...options });
    expect(preview).toHaveBeenCalledTimes(1);
    const callback = preview.mock.calls[0]![2] as unknown as (value: unknown) => void;
    const error = new Error('socket');
    callback({ error });
    expect(source.current.data).toBe(options.initialPlan);
    expect(source.current.error).toBe(error);
    let finish!: (value: PortableRenderPlan) => void;
    fetch.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    const completed = source.current;
    const pending = source.refresh();
    callback({ error: new Error('Disconnected while refreshing') });
    source.reset();
    expect(source.current).toBe(completed);
    finish(plan('cancelled'));
    await pending;
    fetch.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    const refreshing = source.refresh();
    const live = plan('live');
    callback({ data: live });
    finish(plan('older'));
    await refreshing;
    expect(source.current.data).toBe(live);
    expect(preview).toHaveBeenCalledTimes(1);
    source.reset();
    const afterReset = plan('same-session-update');
    callback({ data: afterReset });
    expect(source.current.data).toBe(afterReset);
    source.dispose();
    callback({ data: plan('stale') });
    expect(source.current.data).toBeUndefined();
  });
});

it('retains completed portable display on reset, refuses delayed content and recovers through event-free Retry', async () => {
  const { presentation, source, select, options, fetch, sdk } = setup(plan());
  let generation = 0;
  sdk.captureLifetime = () => {
    const captured = generation;
    return () => captured === generation;
  };
  select(options);
  const completed = source.current;
  let finish!: (value: PortableRenderPlan) => void;
  fetch.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  const pending = source.refresh();
  generation++;
  source.reset();
  finish(plan('old visitor'));
  await pending;
  expect(source.current.result).toBe(completed.result);
  expect(source.current.data).toBe(completed.data);
  expect(source.current.status).toBe(completed.status);
  expect(source.current).toBe(completed);
  select({ ...options });
  expect(fetch).toHaveBeenCalledTimes(1);
  fetch.mockResolvedValueOnce(plan('fresh'));
  await source.retry();
  expect(source.current.data?.experienceId).toBe('fresh');
  const published = source.current;
  expect(presentation.isCurrentSnapshot(published)).toBe(true);
  generation++;
  expect(source.current).toBe(published);
  expect(presentation.isCurrentSnapshot(published)).toBe(false);
  source.dispose();
});

it('retains the seeded acquisition when an equivalent unseeded peer detaches', () => {
  const { source, options, setSdk } = setup(plan());
  setSdk(undefined);
  const seeded = source.attach(() => options);
  const peer = source.attach(() => ({ ...options, initialPlan: undefined }));
  peer.release();
  expect(source.current.data).toBe(options.initialPlan);
  expect(source.current.result?.plan).toBe(options.initialPlan);
  seeded.release();
  expect(source.current.status).toBe('idle');
  source.dispose();
});

it('shares equivalent inputs, supersedes changed selectors and ignores unchanged retired views', () => {
  const { source, options, setSdk } = setup(plan());
  setSdk(undefined);
  let left = options;
  let right: SourceOptions | undefined = options;
  const first = source.attach(() => left);
  const second = source.attach(() => right);
  expect(source.current.data).toBe(options.initialPlan);
  const nextPlan = plan('b');
  left = { ...options, request: { experienceId: 'b' }, initialPlan: nextPlan };
  first.update();
  expect(source.current.data).toBe(nextPlan);
  second.update();
  expect(source.current.data).toBe(nextPlan);
  right = { ...left };
  expect(() => first.update()).not.toThrow();
  expect(() => second.update()).not.toThrow();
  right = undefined;
  left = { ...options, request: { experienceId: 'c' } };
  expect(() => first.update()).not.toThrow();
  first.release();
  second.release();
  expect(source.current.status).toBe('idle');
  source.dispose();
  expect(() => source.attach(() => options)).toThrow(/disposed/);
});

it('claims current redirect navigation once and rejects stale publication authority', async () => {
  const { presentation, source, select, options, fetch } = setup();
  fetch.mockResolvedValueOnce({ redirect: { path: '/next' } });
  select(options);
  await settle();
  const redirected = source.current;
  expect(presentation.claimRedirect(redirected)).toBe(true);
  expect(presentation.claimRedirect(redirected)).toBe(false);
  await source.retry();
  expect(source.current).toBe(redirected);
  presentation.rejectRedirect(new Error('Invalid redirect'));
  expect(source.current.status).toBe('error');
  expect(presentation.isCurrentSnapshot(redirected)).toBe(false);
  source.dispose();
});
