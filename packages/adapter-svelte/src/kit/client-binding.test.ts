import { ContentfulExperiences, createWebSnapshotRuntime } from '@contentful/experiences-web';
import { render } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as owners from '../runtime/owner-controller.svelte.js';
import KitStartupFixture from '../test/fixtures/KitStartupFixture.svelte';
import { bindSvelteKitClientExperiences } from './client-binding.js';

const browserConfig = {
  spaceId: 'space',
  environmentId: 'environment',
  delivery: { accessToken: 'browser-token' },
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  globalThis.localStorage.clear();
  window.history.replaceState({}, '', '/');
});

describe('Kit client startup foundation', () => {
  it('binds without constructing, initializes once and reuses the owner in the mounted root', async () => {
    const create = vi.spyOn(owners, 'createRuntimeOwner');
    const ready = vi.fn();
    const { request } = bindSvelteKitClientExperiences({
      config: { components: {} },
      endpoint: '/_exo/primary',
      ...browserConfig,
      onStatesReady: ready,
    });
    expect(create).not.toHaveBeenCalled();
    await request.init();
    await request.init();
    expect(create).toHaveBeenCalledOnce();
    expect(ready).toHaveBeenCalledOnce();
    const owner = create.mock.results[0]!.value as owners.RuntimeOwner;
    const sdk = owner.current.sdk;
    const view = render(KitStartupFixture, { Root: request.ExperiencesRoot });
    expect(view.getByText('Application baseline')).toBeTruthy();
    await view.rerender({ Root: request.ExperiencesRoot, routeKey: '/next?query=1' });
    expect(owner.current.sdk).toBe(sdk);
    expect(ready).toHaveBeenCalledOnce();
    view.unmount();
    expect(owner.current.status).toBe('disposed');
    // Root cleanup released the actual Web singleton.
    new ContentfulExperiences(browserConfig).destroy();
  });

  it('retains a failed startup for the root without another construction', async () => {
    const create = vi.spyOn(owners, 'createRuntimeOwner');
    const failure = new Error('application setup failed');
    const setup = vi.fn(() => {
      throw failure;
    });
    const { request } = bindSvelteKitClientExperiences({
      config: { components: {} },
      endpoint: '/_exo/primary',
      ...browserConfig,
      onStatesReady: setup,
    });
    await expect(request.init()).resolves.toBeUndefined();
    const owner = create.mock.results[0]!.value as owners.RuntimeOwner;
    const view = render(KitStartupFixture, { Root: request.ExperiencesRoot });
    expect(view.getByText('Application baseline')).toBeTruthy();
    await request.init();
    expect(create).toHaveBeenCalledOnce();
    expect(setup).toHaveBeenCalledOnce();
    expect(owner.current.error).toBe(failure);
    view.unmount();
  });

  it('does not retain a browser owner when init is evaluated without a browser', async () => {
    vi.stubGlobal('window', undefined);
    const create = vi.spyOn(owners, 'createRuntimeOwner');
    const { request } = bindSvelteKitClientExperiences({
      config: { components: {} },
      endpoint: '/_exo/primary',
      ...browserConfig,
    });
    await request.init();
    expect(create).not.toHaveBeenCalled();
  });

  it('keeps injected SDK destruction caller-owned', async () => {
    const sdk = new ContentfulExperiences(browserConfig);
    const destroy = vi.spyOn(sdk, 'destroy');
    const { request } = bindSvelteKitClientExperiences({
      config: { components: {} },
      endpoint: '/_exo/primary',
      ...browserConfig,
    });
    const view = render(request.ExperiencesProvider, { sdk });
    await request.init();
    view.unmount();
    expect(destroy).not.toHaveBeenCalled();
    sdk.destroy();
  });

  it('rejects a conflicting injected provider after owned early initialization', async () => {
    const create = vi.spyOn(owners, 'createRuntimeOwner');
    const { request } = bindSvelteKitClientExperiences({
      config: { components: {} },
      endpoint: '/_exo/primary',
      ...browserConfig,
    });
    await request.init();
    const owner = create.mock.results[0]!.value as owners.RuntimeOwner;
    const sdk = owner.current.sdk!;
    // A structurally supplied different SDK must never abandon the early owner.
    expect(() => render(request.ExperiencesProvider, { sdk: {} as ContentfulExperiences })).toThrow(
      /different injected SDK/
    );
    expect(owner.current.sdk).toBe(sdk);
    owner.dispose();
  });

  it('selects fresh Preview activations after init and committed session changes', async () => {
    const create = vi.spyOn(owners, 'createRuntimeOwner');
    const ready = vi.fn();
    const { request } = bindSvelteKitClientExperiences({
      config: { components: {} },
      endpoint: '/_exo/primary',
      ...browserConfig,
      preview: { accessToken: 'preview' },
      onStatesReady: ready,
    });
    await request.init();
    const early = create.mock.results[0]!.value as owners.RuntimeOwner;
    window.history.replaceState({}, '', '/?preview_session_id=first');
    const view = render(KitStartupFixture, { Root: request.ExperiencesRoot });
    expect(early.current.status).toBe('disposed');
    const first = create.mock.results[1]!.value as owners.RuntimeOwner;
    expect((first.current.sdk as ContentfulExperiences).isPreview).toBe(true);
    await request.init();
    expect(create).toHaveBeenCalledTimes(2);
    window.history.replaceState({}, '', '/?preview_session_id=second');
    await view.rerender({ routeKey: '/?preview_session_id=second' });
    const second = create.mock.results[2]!.value as owners.RuntimeOwner;
    expect(first.current.status).toBe('disposed');
    expect(second.current.status).toBe('ready');
    await request.init();
    expect(create).toHaveBeenCalledTimes(3);
    expect(ready).toHaveBeenCalledTimes(3);
    view.unmount();
  });

  it('keeps the current injected SDK after a rebind and later init', async () => {
    const create = vi.spyOn(owners, 'createRuntimeOwner');
    const first = Object.assign(createWebSnapshotRuntime(), {
      destroy: vi.fn(),
    }) as unknown as ContentfulExperiences;
    const second = Object.assign(createWebSnapshotRuntime(), {
      destroy: vi.fn(),
    }) as unknown as ContentfulExperiences;
    const { request } = bindSvelteKitClientExperiences({
      config: { components: {} },
      endpoint: '/_exo/primary',
      ...browserConfig,
    });
    const view = render(request.ExperiencesProvider, { sdk: first });
    const owner = create.mock.results[0]!.value as owners.RuntimeOwner;
    await view.rerender({ sdk: second });
    expect(owner.current.sdk).toBe(second);
    await request.init();
    expect(owner.current.sdk).toBe(second);
    expect(create).toHaveBeenCalledOnce();
    view.unmount();
    expect(first.destroy).not.toHaveBeenCalled();
    expect(second.destroy).not.toHaveBeenCalled();
  });
});
