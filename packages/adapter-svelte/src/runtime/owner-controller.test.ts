import {
  ContentfulExperiences,
  type Config,
  type ExperiencesSnapshot,
} from '@contentful/experiences-web';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { profile } from '../test/fixtures/runtime-profile.js';
import { createRuntimeOwner, type RuntimeOwner } from './owner-controller.svelte.js';

const config: Config = {
  spaceId: 'space',
  environmentId: 'environment',
  delivery: { accessToken: 'test-token' },
  locale: 'en-US',
};

const owners: RuntimeOwner[] = [];
const injected: ContentfulExperiences[] = [];

function owner(...args: Parameters<typeof createRuntimeOwner>): RuntimeOwner {
  const result = createRuntimeOwner(...args);
  owners.push(result);
  return result;
}

afterEach(() => {
  for (const runtime of owners.splice(0)) runtime.dispose();
  for (const sdk of injected.splice(0)) sdk.destroy();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('portable runtime ownership', () => {
  it('retains inert supplied state and never constructs during creation or server activation', () => {
    vi.stubGlobal('window', undefined);
    const runtime = owner({ locale: 'de-DE', consent: true, data: { profile: profile('server') } });
    expect(runtime.current.status).toBe('idle');
    expect(runtime.current.sdk.states.profile.current?.id).toBe('server');
    expect(runtime.activate({ config }).status).toBe('idle');
    expect(runtime.current.sdk.locale).toBe('de-DE');
  });

  it('activates once with a stable SDK', () => {
    const runtime = owner();
    const setup = vi.fn();
    const active = runtime.activate({ config, onStatesReady: setup });
    expect(active.status).toBe('ready');
    expect(active.sdk).toBeInstanceOf(ContentfulExperiences);
    const repeated = runtime.activate({ config: { ...config, locale: 'de-DE' } });
    expect(repeated.sdk).toBe(active.sdk);
    expect(repeated.sdk.locale).toBe('en-US');
    expect(setup).toHaveBeenCalledOnce();
  });

  it('releases the owned singleton on teardown so a fresh activation can construct', () => {
    const runtime = owner();
    let detached = false;
    runtime.activate({
      config,
      onStatesReady: () => () => {
        detached = true;
      },
    });
    const old = runtime.current.sdk;
    runtime.dispose();
    expect(detached).toBe(true);
    expect(runtime.activate({ config }).status).toBe('disposed');
    const next = owner().activate({ config: { ...config, locale: 'de-DE' } });
    expect(next.status).toBe('ready');
    expect(next.sdk).not.toBe(old);
    expect(next.sdk.locale).toBe('de-DE');
  });

  it('never destroys an injected SDK, including when application setup fails', () => {
    const sdk = new ContentfulExperiences(config);
    injected.push(sdk);
    const destroy = vi.spyOn(sdk, 'destroy');
    const runtime = owner();
    const cleanup = vi.fn();
    runtime.activate({ sdk, onStatesReady: () => cleanup });
    runtime.dispose();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(destroy).not.toHaveBeenCalled();
    const failed = owner();
    failed.activate({
      sdk,
      onStatesReady: () => {
        throw new Error('setup failed');
      },
    });
    expect(failed.current.status).toBe('error');
    expect(destroy).not.toHaveBeenCalled();
  });

  it('keeps construction errors sticky and supplied snapshot state until a fresh owner activates', () => {
    const blocker = new ContentfulExperiences(config);
    injected.push(blocker);
    const runtime = owner({ locale: 'fr-FR', data: { profile: profile('server') } });
    const failed = runtime.activate({ config });
    expect(failed.status).toBe('error');
    expect(failed.error).toBeInstanceOf(Error);
    expect(failed.sdk.states.profile.current?.id).toBe('server');
    blocker.destroy();
    const repeated = runtime.activate({ config });
    expect(repeated.status).toBe('error');
    expect(repeated.error).toBe(failed.error);
    runtime.dispose();
    expect(owner().activate({ config }).status).toBe('ready');
  });

  it('rebinds injected receivers without owning either SDK lifetime', () => {
    const first = new ContentfulExperiences(config);
    injected.push(first);
    const runtime = owner({ data: { profile: profile('old-visitor') } });
    let detached = false;
    runtime.activate({
      sdk: first,
      onStatesReady: () => () => {
        detached = true;
      },
    });
    const repeatedSetup = vi.fn();
    runtime.rebindInjected({ sdk: first, onStatesReady: repeatedSetup });
    expect(repeatedSetup).not.toHaveBeenCalled();
    // The application releases its singleton before supplying a different receiver.
    first.destroy();
    const second = new ContentfulExperiences({ ...config, locale: 'de-DE' });
    injected.push(second);
    const firstDestroy = vi.spyOn(first, 'destroy');
    const secondDestroy = vi.spyOn(second, 'destroy');
    const setup = vi.fn();
    runtime.rebindInjected({ sdk: second, onStatesReady: setup });
    expect(detached).toBe(true);
    expect(runtime.current.sdk).toBe(second);
    expect(runtime.current.sdk.locale).toBe('de-DE');
    expect(setup).toHaveBeenCalledWith(second.states);
    runtime.dispose();
    expect(firstDestroy).not.toHaveBeenCalled();
    expect(secondDestroy).not.toHaveBeenCalled();
  });

  it('keeps failed injected rebinds neutral and does not retry setup for the same SDK', () => {
    const first = new ContentfulExperiences(config);
    injected.push(first);
    const runtime = owner({ data: { profile: profile('old-visitor') } });
    runtime.activate({ sdk: first });
    first.destroy();
    const second = new ContentfulExperiences(config);
    injected.push(second);
    const failure = new Error('setup failed');
    runtime.rebindInjected({
      sdk: second,
      onStatesReady: () => {
        throw failure;
      },
    });
    expect(runtime.current).toMatchObject({ status: 'error', error: failure });
    expect(runtime.current.sdk.states.profile.current).toBeUndefined();
    const setup = vi.fn();
    runtime.rebindInjected({ sdk: second, onStatesReady: setup });
    expect(runtime.current.error).toBe(failure);
    expect(setup).not.toHaveBeenCalled();
  });

  it('destroys owned SDKs after setup failure and permits another owner to activate', () => {
    const runtime = owner({ locale: 'fr-FR' });
    const destroy = vi.spyOn(ContentfulExperiences.prototype, 'destroy');
    runtime.activate({
      config,
      onStatesReady: () => {
        throw new Error('setup');
      },
    });
    expect(runtime.current).toMatchObject({ status: 'error' });
    expect(runtime.current.sdk.locale).toBe('fr-FR');
    expect(destroy).toHaveBeenCalledOnce();
    expect(owner().activate({ config }).status).toBe('ready');
  });

  it('releases the singleton even if application teardown throws', () => {
    const runtime = owner();
    const failure = new Error('cleanup');
    runtime.activate({
      config,
      onStatesReady: () => () => {
        throw failure;
      },
    });
    runtime.dispose();
    expect(runtime.current).toMatchObject({
      status: 'disposed',
      error: failure,
    });
    expect(owner().activate({ config }).status).toBe('ready');
  });

  it('rejects attempts to swap the SDK of an owned activation', () => {
    const runtime = owner();
    const active = runtime.activate({ config });
    expect(() => runtime.rebindInjected({ sdk: active.sdk as ContentfulExperiences })).toThrow(
      TypeError
    );
    expect(runtime.current.sdk).toBe(active.sdk);
  });

  it('disposed owner cannot restore initial visitor snapshot after live reset', () => {
    const snapshot: ExperiencesSnapshot = {
      data: {
        profile: profile('initial-visitor'),
        changes: [
          {
            type: 'Variable',
            key: 'visitor-flag',
            value: 'initial-value',
            meta: { experienceId: 'experiment', variantIndex: 1 },
          },
        ],
      },
    };
    const runtime = owner(snapshot);
    expect(runtime.current.sdk.states.profile.current?.id).toBe('initial-visitor');
    expect(runtime.current.sdk.states.flag('visitor-flag').current).toBe('initial-value');
    runtime.activate({ config: { ...config, defaults: snapshot.data } });
    const live = runtime.current.sdk!;
    expect(live.states.profile.current?.id).toBe('initial-visitor');
    live.reset();
    expect(live.states.profile.current).toBeUndefined();
    expect(live.states.flag('visitor-flag').current).toBeUndefined();

    runtime.dispose();

    expect(runtime.current.status).toBe('disposed');
    expect(runtime.current.sdk.states.profile.current).toBeUndefined();
    expect(runtime.current.sdk.states.flag('visitor-flag').current).toBeUndefined();
  });

  it('cannot publish a live owner after reentrant disposal during setup', () => {
    const runtime = owner();
    const cleanup = vi.fn();
    const destroy = vi.spyOn(ContentfulExperiences.prototype, 'destroy');
    runtime.activate({
      config,
      onStatesReady: () => {
        runtime.dispose();
        return cleanup;
      },
    });
    expect(runtime.current).toMatchObject({ status: 'disposed' });
    expect(cleanup).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
    expect(owner().activate({ config }).status).toBe('ready');
  });

  it('does not publish a new injected receiver when prior cleanup disposes the owner', () => {
    const first = new ContentfulExperiences(config);
    injected.push(first);
    const runtime = owner();
    runtime.activate({ sdk: first, onStatesReady: () => () => runtime.dispose() });
    first.destroy();
    const second = new ContentfulExperiences(config);
    injected.push(second);
    const setup = vi.fn();
    const destroy = vi.spyOn(second, 'destroy');
    runtime.rebindInjected({ sdk: second, onStatesReady: setup });
    expect(runtime.current).toMatchObject({ status: 'disposed' });
    expect(setup).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
  });
});
