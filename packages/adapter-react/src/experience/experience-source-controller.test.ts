import { describe, expect, it, vi } from 'vitest';
import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';
import {
  ExperienceSourceController,
  type ExperienceSourceOptions,
} from './experience-source-controller.js';
import { deferred, plan, previewState, sourceSdk } from '../test/managed-experience.js';

const config = { components: {} };
const options = (
  source: ReturnType<typeof sourceSdk>,
  overrides: Partial<ExperienceSourceOptions> = {}
): ExperienceSourceOptions => ({
  sdk: source.sdk,
  request: { experienceId: 'home' },
  resolve: { config },
  ...overrides,
});
const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('ExperienceSourceController', () => {
  it('seeds a plan without fetching and never reapplies the seed after refresh', async () => {
    const source = sourceSdk();
    const initialPlan = plan('seed');
    const controller = new ExperienceSourceController(initialPlan);
    controller.updateOptions(options(source, { initialPlan }));
    expect(source.fetchExperience).not.toHaveBeenCalled();
    const next = plan('fresh');
    source.fetchExperience.mockResolvedValue(next);
    await controller.refresh();
    controller.updateOptions(options(source, { initialPlan }));
    expect(controller.getSnapshot().data).toBe(next);
    expect(source.fetchExperience).toHaveBeenCalledTimes(1);
  });

  it('retains the seed across snapshot activation', () => {
    const source = sourceSdk();
    const initialPlan = plan();
    const controller = new ExperienceSourceController(initialPlan);
    controller.updateOptions(options(source, { sdk: undefined, initialPlan }));
    controller.updateOptions(options(source, { initialPlan }));
    expect(source.fetchExperience).not.toHaveBeenCalled();
    expect(controller.getSnapshot().data).toBe(initialPlan);
  });

  it('adopts error seeds by identity and does not reapply them after retry or a genuine descriptor change', async () => {
    const source = sourceSdk();
    const initialError = new Error('initial failure');
    const controller = new ExperienceSourceController(undefined, initialError);
    const input = options(source, { initialError });
    controller.updateOptions(input);
    controller.updateOptions(input);
    expect(controller.getSnapshot()).toEqual({
      status: 'error',
      data: undefined,
      error: initialError,
    });
    expect(source.fetchExperience).not.toHaveBeenCalled();
    expect(source.bindings).toHaveLength(1);
    await controller.retry();
    const recovered = controller.getSnapshot().data;
    controller.updateOptions(input);
    expect(controller.getSnapshot()).toEqual({
      status: 'success',
      data: recovered,
      error: undefined,
    });
    expect(source.fetchExperience).toHaveBeenCalledTimes(1);
    const replacement = new Error('replacement failure');
    controller.updateOptions({ ...input, initialError: replacement });
    expect(controller.getSnapshot().error).toBe(replacement);
    expect(source.fetchExperience).toHaveBeenCalledTimes(1);
    controller.updateOptions({
      ...input,
      initialError: replacement,
      request: { experienceId: 'other' },
    });
    await settle();
    expect(controller.getSnapshot().error).toBeUndefined();
    expect(source.fetchExperience).toHaveBeenCalledTimes(2);
  });

  it('retains an error seed during configured initialization and snapshot activation', () => {
    const source = sourceSdk();
    const initialError = new Error('server failure');
    const controller = new ExperienceSourceController(undefined, initialError);
    const initial = options(source, { sdk: undefined, waiting: true, initialError });
    controller.updateOptions(initial);
    expect(controller.getSnapshot().status).toBe('error');
    controller.updateOptions({ ...initial, sdk: source.sdk, waiting: false });
    expect(controller.getSnapshot().error).toBe(initialError);
    expect(source.fetchExperience).not.toHaveBeenCalled();
    expect(source.bindings).toHaveLength(1);
  });

  it('ignores equivalent descriptors after success and failure', async () => {
    const source = sourceSdk();
    const controller = new ExperienceSourceController();
    const request = { experienceId: 'home', parameters: { a: 1, b: { y: 2, x: 3 } } };
    controller.updateOptions(options(source, { request }));
    await settle();
    controller.updateOptions(
      options(source, {
        request: {
          experienceId: 'home',
          parameters: { b: { x: 3, y: 2 }, a: 1 },
          locale: undefined,
        },
        resolve: { config, metadata: {}, debug: false },
      })
    );
    expect(source.fetchExperience).toHaveBeenCalledTimes(1);
    source.fetchExperience.mockRejectedValue('failed');
    await controller.retry();
    controller.updateOptions(options(source, { request }));
    expect(source.fetchExperience).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().error?.message).toBe('failed');
    expect(controller.getSnapshot().data).toBeDefined();
  });

  it('detects in-place nested parameter and metadata edits without replacing SDK argument identities', async () => {
    const source = sourceSdk();
    const controller = new ExperienceSourceController();
    const request = { experienceId: 'home', parameters: { segment: { name: 'one' } } };
    const opaque = new Date(0);
    const metadata = {
      nested: { theme: 'light' },
      opaque,
      read() {
        return this.nested.theme;
      },
    };
    const resolve = { config, metadata };
    const input = options(source, { request, seedRequest: request, resolve });
    controller.updateOptions(input);
    await settle();
    request.parameters.segment.name = 'two';
    controller.updateOptions(input);
    await settle();
    expect(source.fetchExperience).toHaveBeenCalledTimes(2);
    metadata.nested.theme = 'dark';
    controller.updateOptions(input);
    await settle();
    expect(source.fetchExperience).toHaveBeenCalledTimes(3);
    for (const [actualRequest, actualResolve] of source.fetchExperience.mock.calls) {
      expect(actualRequest).toBe(request);
      expect(actualResolve).toBe(resolve);
      expect(actualResolve.metadata).toBe(metadata);
      expect(actualResolve.config).toBe(config);
    }
    expect(metadata.read()).toBe('dark');
    controller.updateOptions(input);
    controller.updateOptions(
      options(source, {
        request: { experienceId: 'home', parameters: { segment: { name: 'two' } } },
        seedRequest: request,
        resolve: { config, metadata: { nested: { theme: 'dark' }, opaque, read: metadata.read } },
      })
    );
    await settle();
    expect(source.fetchExperience).toHaveBeenCalledTimes(3);
  });

  it('retains opaque class identities and refetches only when that identity is replaced', async () => {
    class Context {
      constructor(public name: string) {}
    }
    const source = sourceSdk();
    const controller = new ExperienceSourceController();
    const opaque = new Context('original');
    const input = options(source, { resolve: { config, metadata: { opaque } } });
    controller.updateOptions(input);
    await settle();
    opaque.name = 'updated';
    controller.updateOptions(input);
    await settle();
    expect(source.fetchExperience).toHaveBeenCalledTimes(1);
    expect(source.fetchExperience.mock.calls[0]?.[1]).toBe(input.resolve);
    expect(source.fetchExperience.mock.calls[0]?.[1].metadata?.opaque).toBe(opaque);
    controller.updateOptions({
      ...input,
      resolve: { config, metadata: { opaque: new Context('updated') } },
    });
    await settle();
    expect(source.fetchExperience).toHaveBeenCalledTimes(2);
  });

  it('refresh and retry invalidate pending results, retain content, and strip only events', async () => {
    const source = sourceSdk();
    const first = deferred<PortableRenderPlan>();
    const second = deferred<PortableRenderPlan>();
    const controller = new ExperienceSourceController(plan('seed'));
    const request = {
      experienceId: 'home',
      personalization: {
        profileId: 'profile',
        events: [{ type: 'page' as const }],
      },
    };
    controller.updateOptions(
      options(source, { request, initialPlan: controller.getSnapshot().data })
    );
    source.fetchExperience.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const refreshing = controller.refresh();
    const retrying = controller.retry();
    expect(controller.getSnapshot().status).toBe('loading');
    expect(controller.getSnapshot().data?.nodes[0]?.props.content.title).toBe('seed');
    expect(source.fetchExperience.mock.calls[0]?.[0]).toEqual({
      experienceId: 'home',
      personalization: { profileId: 'profile' },
    });
    expect(request.personalization.events).toHaveLength(1);
    second.resolve(plan('latest'));
    await retrying;
    first.resolve(plan('obsolete'));
    await refreshing;
    expect(controller.getSnapshot().data?.nodes[0]?.props.content.title).toBe('latest');
  });

  it.each(['request', 'resolve', 'registry', 'sdk', 'revision'] as const)(
    'invalidates old results on %s replacement',
    async (kind) => {
      const source = sourceSdk();
      const pending = deferred<PortableRenderPlan>();
      source.fetchExperience.mockReturnValueOnce(pending.promise);
      const controller = new ExperienceSourceController();
      const fetchExperience = vi.fn().mockResolvedValue(plan('new'));
      const context = { revision: {}, fetchExperience };
      const first = options(source, { requestContext: kind === 'revision' ? context : undefined });
      if (kind === 'revision') fetchExperience.mockReturnValueOnce(pending.promise);
      controller.updateOptions(first);
      const next = { ...first };
      if (kind === 'request') next.request = { experienceId: 'other' };
      if (kind === 'resolve') next.resolve = { config, metadata: { context: 'new' } };
      if (kind === 'registry') next.resolve = { config: { components: {} } };
      if (kind === 'sdk') next.sdk = sourceSdk().sdk;
      if (kind === 'revision') next.requestContext = { ...context, revision: {} };
      controller.updateOptions(next);
      await settle();
      const latest = controller.getSnapshot().data;
      pending.resolve(plan('obsolete'));
      await settle();
      expect(controller.getSnapshot().data).toBe(latest);
      expect(latest).toBeDefined();
      expect(source.bindings[0]?.unsubscribe).toHaveBeenCalled();
    }
  );

  it('delegates to the root coordinator with refresh semantics', async () => {
    const source = sourceSdk();
    const fetchExperience = vi.fn().mockResolvedValue(plan());
    const controller = new ExperienceSourceController();
    const request = {
      experienceId: 'home',
      personalization: { profileId: 'id', events: [{ type: 'page' as const }] },
    };
    controller.updateOptions(
      options(source, { request, requestContext: { revision: {}, fetchExperience } })
    );
    await settle();
    await controller.retry();
    expect(fetchExperience.mock.calls[0]).toEqual([source.sdk, request, { config }, false]);
    expect(fetchExperience.mock.calls[1]).toEqual([
      source.sdk,
      { experienceId: 'home', personalization: { profileId: 'id' } },
      { config },
      true,
    ]);
    expect(source.fetchExperience).not.toHaveBeenCalled();
    expect(fetchExperience.mock.calls[0]?.[1]).toBe(request);
    expect(request.personalization.events).toEqual([{ type: 'page' }]);
  });

  it('disconnects bindings and rejects unmounted results and callbacks', async () => {
    const source = sourceSdk();
    const pending = deferred<PortableRenderPlan>();
    source.fetchExperience.mockReturnValue(pending.promise);
    const controller = new ExperienceSourceController();
    const listener = vi.fn();
    controller.setSnapshotListener(listener);
    controller.updateOptions(options(source));
    controller.disconnect();
    listener.mockClear();
    pending.resolve(plan());
    source.bindings[0]!.listener({ data: plan('late preview') });
    await settle();
    await controller.refresh();
    expect(listener).not.toHaveBeenCalled();
    expect(source.preview.listeners.size).toBe(0);
    expect(source.consent.listeners.size).toBe(0);
  });

  it('allows preview data and error together, retaining content after errors', () => {
    const source = sourceSdk();
    const initialPlan = plan('seed');
    const controller = new ExperienceSourceController(initialPlan);
    controller.updateOptions(options(source, { initialPlan }));
    const error = new Error('partial preview');
    const data = plan('usable');
    source.bindings[0]!.listener({ data, error });
    expect(controller.getSnapshot()).toEqual({ data, error, status: 'error' });
    source.bindings[0]!.listener({ error: new Error('resolution failed') });
    expect(controller.getSnapshot().data).toBe(data);
    source.bindings[0]!.listener({ data: plan('recovered') });
    expect(controller.getSnapshot().status).toBe('success');
    expect(controller.getSnapshot().error).toBeUndefined();
  });

  it('does not inherit another Experience source error into a successful snapshot', async () => {
    const source = sourceSdk();
    source.preview.emit(previewState({ experienceId: 'other', error: new Error('other source') }));
    const controller = new ExperienceSourceController();
    const data = plan('ordinary snapshot');
    source.fetchExperience.mockResolvedValue(data);
    controller.updateOptions(options(source));
    await settle();
    expect(controller.getSnapshot()).toEqual({ status: 'success', data, error: undefined });
  });

  it('rebinds replaced preview sources, invalidates their pending fetch, and ignores status-only changes', async () => {
    const source = sourceSdk();
    source.preview.emit(previewState());
    const pending = deferred<PortableRenderPlan>();
    source.fetchExperience
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue(plan('new session'));
    const controller = new ExperienceSourceController();
    controller.updateOptions(options(source));
    const firstBinding = source.bindings[0]!;
    source.preview.emit(previewState({ status: 'static' }));
    expect(source.fetchExperience).toHaveBeenCalledTimes(1);
    expect(source.bindings).toHaveLength(1);
    source.preview.emit(undefined);
    source.preview.emit(previewState({ sessionId: 'session-b' }));
    controller.updateOptions(options(source));
    await settle();
    firstBinding.listener({ data: plan('old session') });
    pending.resolve(plan('old snapshot'));
    await settle();
    expect(controller.getSnapshot().data?.nodes[0]?.props.content.title).toBe('new session');
    expect(firstBinding.unsubscribe).toHaveBeenCalled();
    expect(source.fetchExperience).toHaveBeenCalledTimes(2);
  });

  it('uses preview content revisions to reject stale snapshots without refetching', async () => {
    const source = sourceSdk();
    source.preview.emit(previewState());
    const pending = deferred<PortableRenderPlan>();
    source.fetchExperience.mockReturnValue(pending.promise);
    const controller = new ExperienceSourceController();
    controller.updateOptions(options(source));
    source.preview.emit(
      previewState({ revision: 2, data: { sys: { type: 'Experience' }, nodes: [] } })
    );
    source.bindings.at(-1)!.listener({ data: plan('stream') });
    pending.resolve(plan('stale snapshot'));
    await settle();
    expect(source.fetchExperience).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().data?.nodes[0]?.props.content.title).toBe('stream');
  });

  it('keeps unrelated preview updates on their own sources', async () => {
    const source = sourceSdk();
    source.preview.emit(previewState({ experienceId: 'another' }));
    const controller = new ExperienceSourceController();
    controller.updateOptions(options(source));
    await settle();
    source.preview.emit(previewState({ experienceId: 'another', revision: 2, status: 'static' }));
    expect(source.subscribeToPreview).not.toHaveBeenCalled();
    expect(source.fetchExperience).toHaveBeenCalledTimes(1);
  });

  it('reports preview setup failure without discarding its initial plan', () => {
    const source = sourceSdk();
    source.subscribeToPreview.mockImplementation(() => {
      throw new Error('setup failed');
    });
    const initialPlan = plan();
    const controller = new ExperienceSourceController(initialPlan);
    controller.updateOptions(options(source, { initialPlan }));
    expect(controller.getSnapshot()).toEqual({
      data: initialPlan,
      error: new Error('setup failed'),
      status: 'error',
    });
    expect(source.fetchExperience).not.toHaveBeenCalled();
  });

  it.each([true, undefined])(
    'invalidates pending presentation on consent withdrawal from %s without automatic refetch',
    async (initialConsent) => {
      const source = sourceSdk();
      source.consent.emit(initialConsent);
      const pending = deferred<PortableRenderPlan>();
      const initialPlan = plan('retained');
      const controller = new ExperienceSourceController(initialPlan);
      const input = options(source, { initialPlan });
      controller.updateOptions(input);
      source.fetchExperience.mockReturnValueOnce(pending.promise);
      const refreshing = controller.refresh();
      source.consent.emit(false);
      source.consent.emit(true);
      controller.updateOptions(input);
      pending.resolve(plan('withdrawn visitor'));
      await refreshing;
      expect(controller.getSnapshot().data).toBe(initialPlan);
      expect(source.fetchExperience).toHaveBeenCalledTimes(1);
      await controller.retry();
      expect(source.fetchExperience).toHaveBeenCalledTimes(2);
    }
  );

  it('treats empty plans as successful content', async () => {
    const source = sourceSdk();
    const empty = { ...plan(), nodes: [] };
    source.fetchExperience.mockResolvedValue(empty);
    const controller = new ExperienceSourceController();
    controller.updateOptions(options(source));
    await settle();
    expect(controller.getSnapshot()).toEqual({ status: 'success', data: empty, error: undefined });
  });

  it('adopts a pending preview snapshot after visitor consent is revoked', async () => {
    const source = sourceSdk();
    Object.defineProperty(source.sdk, 'isPreview', { value: true });
    source.preview.emit(previewState());
    const pending = deferred<PortableRenderPlan>();
    source.fetchExperience.mockReturnValueOnce(pending.promise);
    const controller = new ExperienceSourceController();
    controller.updateOptions(options(source));
    source.consent.emit(false);
    const selected = plan('preview snapshot');
    pending.resolve(selected);
    await settle();
    expect(controller.getSnapshot()).toEqual({
      status: 'success',
      data: selected,
      error: undefined,
    });
    expect(source.fetchExperience).toHaveBeenCalledTimes(1);
  });

  it.each([
    { locale: 'de-DE' },
    { parameters: { segment: 'one' } },
    { extensions: { sourceMap: {} } },
  ])(
    'rejects unsupported matching preview fields %j before fetch or seed adoption and ignores late updates',
    async (unsupported) => {
      const source = sourceSdk();
      source.preview.emit(previewState());
      const initialPlan = plan('retained');
      const controller = new ExperienceSourceController(initialPlan);
      const valid = options(source, { initialPlan });
      controller.updateOptions(valid);
      const binding = source.bindings[0]!;
      const request = { experienceId: 'home', ...unsupported };
      const input = options(source, { initialPlan, request });
      controller.updateOptions(input);
      const error = controller.getSnapshot().error;
      expect(error).toBeInstanceOf(TypeError);
      expect(controller.getSnapshot().data).toBe(initialPlan);
      binding.listener({ data: plan('late preview'), error: undefined });
      source.preview.emit(
        previewState({ revision: 2, data: { sys: { type: 'Experience' }, nodes: [] } })
      );
      controller.updateOptions(input);
      await controller.refresh();
      expect(controller.getSnapshot()).toEqual({ status: 'error', data: initialPlan, error });
      expect(source.fetchExperience).not.toHaveBeenCalled();
      expect(source.bindings).toHaveLength(1);
      expect(request).toEqual({ experienceId: 'home', ...unsupported });
      controller.updateOptions(valid);
      await settle();
      source.bindings.at(-1)!.listener({ data: plan('corrected') });
      expect(controller.getSnapshot().status).toBe('success');
      expect(controller.getSnapshot().error).toBeUndefined();
    }
  );

  it.each([{ locale: 'de-DE' }, { parameters: {} }, { extensions: {} }])(
    'rejects an unvalidated cold seed for an invalid matching preview descriptor %j',
    (unsupported) => {
      const source = sourceSdk();
      source.preview.emit(previewState());
      const initialPlan = plan('seed');
      const controller = new ExperienceSourceController(initialPlan);
      controller.updateOptions(
        options(source, { initialPlan, request: { experienceId: 'home', ...unsupported } })
      );
      expect(controller.getSnapshot().status).toBe('error');
      expect(controller.getSnapshot().error).toBeInstanceOf(TypeError);
      expect(controller.getSnapshot().data).toBeUndefined();
      expect(source.subscribeToPreview).not.toHaveBeenCalled();
      expect(source.fetchExperience).not.toHaveBeenCalled();
    }
  );

  it.each([{ locale: 'de-DE' }, { parameters: {} }, { extensions: {} }])(
    'discards fetched A content when B has an invalid matching preview descriptor %j',
    async (unsupported) => {
      const source = sourceSdk();
      source.preview.emit(previewState({ experienceId: 'a' }));
      const dataA = plan('A');
      source.fetchExperience.mockResolvedValueOnce(dataA);
      const controller = new ExperienceSourceController();
      controller.updateOptions(options(source, { request: { experienceId: 'a' } }));
      await settle();
      expect(controller.getSnapshot().data).toBe(dataA);
      const bindingA = source.bindings[0]!;
      source.preview.emit(previewState({ experienceId: 'b', sessionId: 'b-session' }));
      const invalidB = options(source, { request: { experienceId: 'b', ...unsupported } });
      controller.updateOptions(invalidB);
      const error = controller.getSnapshot().error;
      expect(error).toBeInstanceOf(TypeError);
      expect(controller.getSnapshot().data).toBeUndefined();
      bindingA.listener({ data: dataA });
      bindingA.listener({ data: plan('B') });
      source.preview.emit(
        previewState({
          experienceId: 'b',
          revision: 2,
          data: { sys: { type: 'Experience' }, nodes: [] },
        })
      );
      controller.updateOptions(invalidB);
      await settle();
      expect(controller.getSnapshot()).toEqual({ data: undefined, status: 'error', error });
      expect(bindingA.unsubscribe).toHaveBeenCalled();
      expect(source.bindings).toHaveLength(1);
      expect(source.fetchExperience).toHaveBeenCalledTimes(1);
    }
  );
});
