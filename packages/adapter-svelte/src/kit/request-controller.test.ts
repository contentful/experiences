import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExperienceApiClient as PersonalizationApiClient } from '@contentful/optimization-api-client';
import { ContentfulExperiences, type Config as WebConfig } from '@contentful/experiences-web';
import { createClientLoader } from './client-loader.js';
import { createRequestController } from './request-controller.svelte.js';
import { createPageSequence } from '../runtime/page-sequence.svelte.js';
import { createRequestSource } from './request-source.js';
import type { RequestResult } from './request-result.js';
import { profile } from '../test/fixtures/runtime-profile.js';

const config = {
  spaceId: 'space',
  environmentId: 'environment',
  delivery: { accessToken: 'token' },
};
const owners: ContentfulExperiences[] = [];
const sequences: ReturnType<typeof createPageSequence>[] = [];
const controllers: ReturnType<typeof createRequestController>[] = [];
function setup(options: Partial<WebConfig> = {}) {
  const sdk = new ContentfulExperiences({ ...config, ...options });
  owners.push(sdk);
  const redirect = vi.fn<(path: string) => void | Promise<unknown>>();
  const controller = createRequestController(redirect);
  controllers.push(controller);
  let currentSdk: ContentfulExperiences | undefined = sdk;
  const route = createPageSequence(() => currentSdk);
  sequences.push(route);
  controller.attach(sdk, route);
  return {
    sdk,
    controller,
    redirect,
    attach(next: ContentfulExperiences | undefined) {
      currentSdk = next;
      controller.attach(next, route);
    },
  };
}
function result(id: string, extra: Partial<RequestResult> = {}): RequestResult {
  return {
    requestId: id,
    routeKey: '/',
    experience: { experienceId: 'primary' },
    plan: { experienceId: 'primary', nodes: [], diagnostics: [], metadata: {}, debug: false },
    handoff: {
      spaceId: 'space',
      environmentId: 'environment',
      cache: { scope: 'private-request' },
      state: { profile: profile(id) },
    },
    ...extra,
  };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}
afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.dispose());
  sequences.splice(0).forEach((route) => route.dispose());
  owners.splice(0).forEach((sdk) => sdk.destroy());
  globalThis.localStorage.clear();
  vi.restoreAllMocks();
});

describe('committed Kit request journeys', () => {
  it('hydrates the exact captured result and adopts a warm source only when committed, without another content fetch', async () => {
    const { sdk, controller } = setup();
    const captured = result('document', { initialPageOwner: 'server' });
    const first = createRequestSource({ routeKey: '/', result: captured });
    controller.seed(first);
    await controller.update(first, '/');
    expect(controller.presentation.current.result).toBe(captured);
    expect(controller.presentation.current.data).toBe(captured.plan);
    expect(sdk.states.profile.current?.id).toBe('document');
    const owner = {
      current: { status: 'ready' as const, sdk, error: undefined },
      owned: false,
      sessionId: undefined,
      activate: () => ({ status: 'ready' as const, sdk, error: undefined }),
      dispose() {},
    };
    const warm = result('warm', { routeKey: '/next', experience: { experienceId: 'next' } });
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new globalThis.Response(JSON.stringify(warm)));
    const load = createClientLoader({
      endpoint: '/_exo/primary',
      getOwner: () => owner,
      getCommittedSource: () => controller.source,
      getCommittedSelection: () => controller.selection,
      initializedBeforeLoad: () => false,
    });
    const source = await load(
      { url: new URL('https://example.test/next'), fetch },
      { experience: warm.experience }
    );
    expect(controller.presentation.current.result).toBe(captured);
    expect(sdk.states.profile.current?.id).toBe('document');
    await controller.update(source, '/next');
    expect(controller.presentation.current.result).toEqual(warm);
    expect(sdk.states.profile.current?.id).toBe('warm');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('displays expired prepared content unchanged while Web refuses stale state and replay', async () => {
    const send = vi
      .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
      .mockResolvedValue({ profile: profile('stale') } as never);
    const { sdk, controller } = setup({ defaults: { consent: true }, allowedEventTypes: [] });
    const preparation = sdk.capturePreparation();
    const builder = sdk.eventBuilder;
    const prepared = result('stale', {
      handoff: {
        ...result('stale').handoff!,
        profileId: 'stale',
        replay: { routeKey: '/', events: [builder.buildTrack({ event: 'stale' })] },
      },
    });
    const read = vi.fn();
    const source = createRequestSource({ routeKey: '/', result: prepared, preparation }, read);
    sdk.consent({ events: false });
    await controller.update(source, '/');
    expect(controller.presentation.current.result).toBe(prepared);
    expect(controller.presentation.current.data).toBe(prepared.plan);
    expect(read).not.toHaveBeenCalled();
    expect(sdk.states.profile.current).toBeUndefined();
    expect(sdk.states.eventStream.current).toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });

  it('supersedes delayed Web adoption and rejects older request identities across owner replacement', async () => {
    const send = vi
      .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
      .mockResolvedValue({ profile: profile('unexpected') } as never);
    const { sdk, controller, attach } = setup();
    const gate = deferred();
    const intercepting = deferred();
    sdk.interceptors.state.add(async (state) => {
      if (state.profile?.id === 'a') {
        intercepting.resolve();
        await gate.promise;
      }
      return state;
    });
    const a = result('a');
    const sourceA = createRequestSource({ routeKey: '/', result: a });
    const pending = controller.update(sourceA, '/');
    expect(controller.update(sourceA, '/')).toBe(pending);
    await intercepting.promise;
    const b = result('b', { routeKey: '/b' });
    const sourceB = createRequestSource({ routeKey: '/b', result: b });
    await controller.update(sourceB, '/b');
    gate.resolve();
    await pending;
    expect(sdk.states.profile.current?.id).toBe('b');
    expect(controller.presentation.current.result).toBe(b);
    sdk.destroy();
    const replacement = new ContentfulExperiences(config);
    owners.push(replacement);
    attach(replacement);
    const c = result('c', { routeKey: '/c' });
    await controller.update(createRequestSource({ routeKey: '/c', result: c }), '/c');
    await controller.update(sourceA, '/');
    expect(replacement.states.profile.current?.id).toBe('c');
    expect(replacement.states.eventStream.current).toBeUndefined();
    expect(controller.presentation.current.result).toBe(a);
    expect(controller.presentation.current.data).toBe(a.plan);
    const cached = result('unused-after-replacement', {
      handoff: {
        ...result('unused-after-replacement').handoff!,
        replay: { routeKey: '/', events: [replacement.eventBuilder.buildPageView()] },
      },
    });
    await controller.update(createRequestSource({ routeKey: '/', result: cached }), '/');
    await replacement.flush();
    expect(controller.presentation.current.result).toBe(cached);
    expect(replacement.states.profile.current?.id).toBe('c');
    expect(send).not.toHaveBeenCalled();
  });
  it('retains the same selection and exact display through event-free failure, profile/reset changes and read recovery', async () => {
    const send = vi
      .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
      .mockResolvedValue({ profile: profile('first') } as never);
    const { sdk, controller } = setup({ locale: 'en-US', defaults: { consent: true } });
    const builder = sdk.eventBuilder;
    const first = result('first', {
      handoff: {
        ...result('first').handoff!,
        profileId: 'first',
        replay: {
          routeKey: '/',
          events: [builder.buildPageView({ properties: { title: 'First' } })],
        },
      },
    });
    const failed = {
      routeKey: '/',
      experience: first.experience,
      error: new Error('Offline'),
    };
    const recovered = result('read', { eventFree: true, handoff: undefined });
    const read = vi
      .fn()
      .mockResolvedValueOnce(failed)
      .mockImplementationOnce(async () => ({
        routeKey: '/',
        locale: sdk.locale,
        result: recovered,
      }));
    const source = createRequestSource({ routeKey: '/', result: first }, read);
    await controller.update(source, '/');
    await sdk.flush();
    const messages = send.mock.calls
      .flatMap(([body]) => body.events)
      .map((event) => event.messageId);
    expect(messages).toHaveLength(1);
    const cached = result('unused-preload', {
      handoff: first.handoff,
      initialPagePayload: { properties: { title: 'No new visit' } },
    });
    await controller.update(createRequestSource({ routeKey: '/', result: cached }), '/');
    expect(controller.presentation.current.result).toBe(cached);
    expect(cached.eventFree).toBeUndefined();
    expect(cached.handoff).toBe(first.handoff);
    expect(sdk.states.profile.current?.id).toBe('first');
    await controller.update(source, '/');
    expect(controller.presentation.current.result).toBe(first);
    await controller.refresh();
    expect(controller.presentation.current.data).toBe(first.plan);
    expect(controller.presentation.current.result).toBeUndefined();
    expect(controller.presentation.current.error?.message).toBe('Offline');
    sdk.reset();
    expect(controller.presentation.current.data).toBe(first.plan);
    sdk.setLocale('de-DE');
    controller.observeLocale();
    expect(controller.presentation.current.data).toBeUndefined();
    await controller.refresh();
    controller.observeLocale();
    expect(controller.presentation.current.result).toBe(recovered);
    expect(controller.presentation.current.data).toBe(recovered.plan);
    await sdk.flush();
    expect(
      send.mock.calls.flatMap(([body]) => body.events).map((event) => event.messageId)
    ).toEqual(messages);
    sdk.setLocale('fr-FR');
    controller.observeLocale();
    expect(controller.presentation.current.data).toBeUndefined();
    const explicit = result('explicit', {
      experience: { experienceId: 'primary', locale: 'en-US' },
      eventFree: true,
    });
    await controller.update(
      createRequestSource({ routeKey: '/', result: explicit, locale: 'en-US' }),
      '/'
    );
    sdk.setLocale('es-ES');
    controller.observeLocale();
    expect(controller.presentation.current.result).toBe(explicit);
    expect(controller.presentation.current.data).toBe(explicit.plan);
  });

  it('keeps pending read and Web writes bounded by reset, withdrawal and supersession while completed display remains', async () => {
    const { sdk, controller } = setup({ defaults: { consent: true }, allowedEventTypes: [] });
    const initial = result('initial');
    const reading = deferred();
    const source = createRequestSource({ routeKey: '/', result: initial }, async () => {
      await reading.promise;
      return {
        routeKey: '/',
        result: result('late-read', { eventFree: true }),
      };
    });
    await controller.update(source, '/');
    const pending = controller.refresh();
    sdk.reset();
    reading.resolve();
    await pending;
    expect(controller.presentation.current.result).toBe(initial);
    expect(controller.presentation.current.data).toBe(initial.plan);
    const intercepting = deferred();
    const gate = deferred();
    sdk.interceptors.state.add(async (state) => {
      intercepting.resolve();
      await gate.promise;
      return state;
    });
    const next = result('withdrawn', {
      routeKey: '/next',
      handoff: {
        ...initial.handoff!,
        state: { profile: profile('withdrawn') },
        replay: { routeKey: '/next', events: [sdk.eventBuilder.buildTrack({ event: 'stale' })] },
      },
    });
    const prepared = createRequestSource({
      routeKey: '/next',
      result: next,
      preparation: sdk.capturePreparation(),
    });
    const adopting = controller.update(prepared, '/next');
    await intercepting.promise;
    sdk.consent({ events: false });
    gate.resolve();
    await adopting;
    expect(controller.presentation.current.result).toBe(next);
    expect(controller.presentation.current.data).toBe(next.plan);
    expect(sdk.states.profile.current).toBeUndefined();
    expect(sdk.states.eventStream.current).toBeUndefined();
    const laterRead = deferred();
    const current = createRequestSource({ routeKey: '/next', result: next }, async () => {
      await laterRead.promise;
      return {
        routeKey: '/next',
        result: result('destroyed-read', { routeKey: '/next', eventFree: true }),
      };
    });
    await controller.update(current, '/next');
    const destroying = controller.refresh();
    sdk.destroy();
    laterRead.resolve();
    await destroying;
    expect(controller.presentation.current.result).toBe(next);
    expect(controller.presentation.current.data).toBe(next.plan);
  });
  it('keeps content failures independent of replay and handles authoritative outcomes and cached redirects on each current adoption', async () => {
    const send = vi
      .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
      .mockResolvedValue({ profile: profile('visitor') } as never);
    const { sdk, controller, redirect } = setup({ defaults: { consent: true } });
    const failure = result('content-failure', {
      plan: undefined,
      contentError: 'Unavailable',
      handoff: {
        ...result('content-failure').handoff!,
        replay: { routeKey: '/', events: [sdk.eventBuilder.buildTrack({ event: 'eligible' })] },
      },
    });
    await controller.update(createRequestSource({ routeKey: '/', result: failure }), '/');
    await sdk.flush();
    expect(controller.presentation.current.result).toBe(failure);
    expect(controller.presentation.current.error?.message).toBe('Unavailable');
    expect(send.mock.calls.flatMap(([body]) => body.events).map((event) => event.type)).toEqual([
      'track',
    ]);
    const read = vi
      .fn()
      .mockResolvedValueOnce({
        routeKey: '/',
        result: result('missing', { eventFree: true, plan: undefined, notFound: true }),
      })
      .mockResolvedValueOnce({
        routeKey: '/',
        result: result('recovered', { eventFree: true }),
      })
      .mockResolvedValueOnce({
        routeKey: '/',
        result: result('denied', {
          eventFree: true,
          plan: undefined,
          contentErrorKind: 'authorization',
          contentError: 'Denied',
        }),
      });
    await controller.update(
      createRequestSource({ routeKey: '/', result: result('empty', { eventFree: true }) }, read),
      '/'
    );
    expect(controller.presentation.current.status).toBe('success');
    await controller.refresh();
    expect(controller.presentation.current.result?.notFound).toBe(true);
    expect(controller.presentation.current.data).toBeUndefined();
    await controller.refresh();
    expect(controller.presentation.current.data?.experienceId).toBe('primary');
    await controller.refresh();
    expect(controller.presentation.current.data).toBeUndefined();
    const target = result('redirect', {
      routeKey: '/redirect',
      plan: undefined,
      redirect: { path: '//external.invalid' },
    });
    const invalidSource = createRequestSource({ routeKey: '/redirect', result: target });
    await controller.update(invalidSource, '/redirect');
    expect(controller.presentation.current.status).toBe('error');
    expect(controller.presentation.current.error).toBeInstanceOf(TypeError);
    await controller.update(
      createRequestSource({ routeKey: '/', result: result('back', { eventFree: true }) }),
      '/'
    );
    await controller.update(invalidSource, '/redirect');
    expect(controller.presentation.current.status).toBe('error');
    expect(controller.presentation.current.error).toBeInstanceOf(TypeError);
    expect(redirect).not.toHaveBeenCalled();
    const local = result('local-redirect', {
      routeKey: '/redirect',
      plan: undefined,
      redirect: { path: '/local' },
    });
    const localSource = createRequestSource({ routeKey: '/redirect', result: local });
    const navigating = deferred();
    redirect.mockReturnValueOnce(navigating.promise);
    const pendingRedirect = controller.update(localSource, '/redirect');
    expect(controller.update(localSource, '/redirect')).toBe(pendingRedirect);
    navigating.resolve();
    await pendingRedirect;
    await controller.update(
      createRequestSource({ routeKey: '/', result: result('returned', { eventFree: true }) }),
      '/'
    );
    await controller.update(localSource, '/redirect');
    expect(redirect.mock.calls).toEqual([['/local'], ['/local']]);
    const delayedRedirect = deferred();
    redirect.mockImplementationOnce(async () => {
      await delayedRedirect.promise;
      throw new Error('late navigation failure');
    });
    const stale = controller.update(
      createRequestSource({
        routeKey: '/redirect',
        result: result('late-redirect', { routeKey: '/redirect', redirect: { path: '/late' } }),
      }),
      '/redirect'
    );
    const latest = result('latest', { routeKey: '/latest', eventFree: true });
    await controller.update(
      createRequestSource({ routeKey: '/latest', result: latest }),
      '/latest'
    );
    delayedRedirect.resolve();
    await stale;
    expect(controller.presentation.current.result).toBe(latest);
    expect(controller.presentation.current.error).toBeUndefined();
    expect(sdk.states.eventStream.current?.type).toBe('track');
    await controller.update(
      createRequestSource({
        routeKey: '/wrong',
        result: result('wrong', { routeKey: '/wrong' }),
      }),
      '/actual'
    );
    expect(controller.presentation.current.data).toBeUndefined();
    expect(controller.presentation.current.result).toBeUndefined();
  });
});
