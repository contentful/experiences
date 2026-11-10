import { describe, expect, it, vi } from 'vitest';
import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';
import { SourceController, type ExperienceSourceOptions } from './source-controller.js';
import { deferred, sourceSdk } from '../test/managed-experience.js';
import { plan, previewState } from '../test/fixtures/managed-experience.js';

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

describe('SourceController', () => {
  it('adopts error seeds by identity and does not reapply them after retry or a genuine descriptor change', async () => {
    const source = sourceSdk();
    const initialError = new Error('initial failure');
    const controller = new SourceController(undefined, initialError);
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

  it('ignores equivalent descriptors after success and failure', async () => {
    const source = sourceSdk();
    const controller = new SourceController();
    const request = { experienceId: 'home', parameters: { a: 1, b: { y: 2, x: 3 } } };
    const resolve = { config, metadata: { at: new Date(0) } };
    controller.updateOptions(options(source, { request, resolve }));
    await settle();
    controller.updateOptions(
      options(source, {
        request: {
          experienceId: 'home',
          parameters: { b: { x: 3, y: 2 }, a: 1 },
          locale: undefined,
        },
        resolve: { config, metadata: { at: new Date(0) }, debug: false },
      })
    );
    expect(source.fetchExperience).toHaveBeenCalledTimes(1);
    source.fetchExperience.mockRejectedValue('failed');
    await controller.retry();
    controller.updateOptions(options(source, { request, resolve }));
    expect(source.fetchExperience).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().error?.message).toBe('failed');
    expect(controller.getSnapshot().data).toBeDefined();
    controller.updateOptions(
      options(source, { request, resolve: { config, metadata: { at: new Date(1) } } })
    );
    await settle();
    expect(source.fetchExperience).toHaveBeenCalledTimes(3);
  });

  it.each([() => new Map(), () => new (class Context {})()])(
    'retains opaque metadata references and refetches on replacement (%#)',
    async (createOpaque) => {
      const source = sourceSdk();
      const controller = new SourceController();
      const opaque = createOpaque();
      controller.updateOptions(options(source, { resolve: { config, metadata: { opaque } } }));
      await settle();
      controller.updateOptions(options(source, { resolve: { config, metadata: { opaque } } }));
      expect(source.fetchExperience).toHaveBeenCalledTimes(1);
      controller.updateOptions(
        options(source, { resolve: { config, metadata: { opaque: createOpaque() } } })
      );
      await settle();
      expect(source.fetchExperience).toHaveBeenCalledTimes(2);
    }
  );

  it('refresh and retry invalidate pending results, retain content, and strip only events', async () => {
    const source = sourceSdk();
    const first = deferred<PortableRenderPlan>();
    const second = deferred<PortableRenderPlan>();
    const controller = new SourceController(plan('seed'));
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
      const controller = new SourceController();
      const fetchExperience = vi.fn().mockResolvedValue(plan('new'));
      const context = { revision: {}, fetchExperience };
      const first = options(source, {
        requestContext: kind === 'revision' ? context : undefined,
        resolve: kind === 'resolve' ? { config, metadata: { values: [1] } } : { config },
      });
      if (kind === 'revision') fetchExperience.mockReturnValueOnce(pending.promise);
      controller.updateOptions(first);
      const next = { ...first };
      if (kind === 'request') next.request = { experienceId: 'other' };
      if (kind === 'resolve') next.resolve = { config, metadata: { values: [1, undefined] } };
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
    const controller = new SourceController();
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

  it('does not inherit another Experience source error into a successful snapshot', async () => {
    const source = sourceSdk();
    source.preview.emit(previewState({ experienceId: 'other', error: new Error('other source') }));
    const controller = new SourceController();
    const data = plan('ordinary snapshot');
    source.fetchExperience.mockResolvedValue(data);
    controller.updateOptions(options(source));
    await settle();
    expect(controller.getSnapshot()).toEqual({ status: 'success', data, error: undefined });
  });

  it('treats empty plans as successful content', async () => {
    const source = sourceSdk();
    const empty = { ...plan(), nodes: [] };
    source.fetchExperience.mockResolvedValue(empty);
    const controller = new SourceController();
    controller.updateOptions(options(source));
    await settle();
    expect(controller.getSnapshot()).toEqual({ status: 'success', data: empty, error: undefined });
  });
});
