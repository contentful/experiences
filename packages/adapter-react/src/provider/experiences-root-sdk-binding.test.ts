import { describe, expect, it, vi } from 'vitest';
import { createWebSnapshotRuntime, type ExperiencesWebConfig } from '@contentful/experiences-web';
import {
  createExperiencesRootSdkBinding,
  disposeExperiencesRootSdkBinding,
} from './experiences-root-sdk-binding.js';

// Ownership follows Optimization's optimizationRootRuntime.ts and provider tests
// at 59add9d6ebff503b9033a59a2eee0149d4b4e925. Experiences additionally disposes
// owned SDKs in finally when application subscription cleanup throws.
const config: ExperiencesWebConfig = {
  spaceId: 'space',
  environmentId: 'master',
  delivery: { accessToken: 'delivery' },
};

function sdk() {
  return { ...createWebSnapshotRuntime(), destroy: vi.fn() };
}

describe('Experiences host bindings', () => {
  it('passes configuration to the owned factory and attaches observers synchronously', () => {
    const runtime = sdk();
    const createSdk = vi.fn(() => runtime);
    const cleanup = vi.fn();
    const onStatesReady = vi.fn(() => cleanup);
    const binding = createExperiencesRootSdkBinding({ config, createSdk, onStatesReady });

    expect(createSdk).toHaveBeenCalledExactlyOnceWith(config);
    expect(onStatesReady).toHaveBeenCalledExactlyOnceWith(runtime.states);
    expect(binding).toEqual({ sdk: runtime, ownsInstance: true, cleanup });
    expect(runtime.destroy).not.toHaveBeenCalled();
    disposeExperiencesRootSdkBinding(binding);
    expect(cleanup).toHaveBeenCalledOnce();
    expect(runtime.destroy).toHaveBeenCalledOnce();
    expect(cleanup.mock.invocationCallOrder[0]).toBeLessThan(
      runtime.destroy.mock.invocationCallOrder[0]!
    );
  });

  it('cleans subscriptions without destroying an injected SDK', () => {
    const runtime = sdk();
    const cleanup = vi.fn();
    const binding = createExperiencesRootSdkBinding({ sdk: runtime, onStatesReady: () => cleanup });
    expect(binding.ownsInstance).toBe(false);
    disposeExperiencesRootSdkBinding(binding);
    expect(cleanup).toHaveBeenCalledOnce();
    expect(runtime.destroy).not.toHaveBeenCalled();
  });

  it.each([true, false])('onStatesReady failure destroys only owned SDKs (owned=%s)', (owned) => {
    const runtime = sdk();
    const error = new Error('observer setup failed');
    const onStatesReady = () => {
      throw error;
    };
    expect(() =>
      createExperiencesRootSdkBinding(
        owned
          ? { config, createSdk: () => runtime, onStatesReady }
          : { sdk: runtime, onStatesReady }
      )
    ).toThrow(error);
    expect(runtime.destroy).toHaveBeenCalledTimes(owned ? 1 : 0);
  });

  it.each([true, false])('cleanup failure preserves teardown ownership (owned=%s)', (owned) => {
    const runtime = sdk();
    const error = new Error('unsubscribe failed');
    const cleanup = vi.fn(() => {
      throw error;
    });
    const binding = createExperiencesRootSdkBinding(
      owned
        ? { config, createSdk: () => runtime, onStatesReady: () => cleanup }
        : { sdk: runtime, onStatesReady: () => cleanup }
    );
    expect(() => disposeExperiencesRootSdkBinding(binding)).toThrow(error);
    expect(cleanup).toHaveBeenCalledOnce();
    expect(runtime.destroy).toHaveBeenCalledTimes(owned ? 1 : 0);
  });

  it('propagates factory failure without attaching observers and accepts absent cleanup', () => {
    const onStatesReady = vi.fn();
    const error = new Error('construction failed');
    expect(() =>
      createExperiencesRootSdkBinding({
        config,
        createSdk: () => {
          throw error;
        },
        onStatesReady,
      })
    ).toThrow(error);
    expect(onStatesReady).not.toHaveBeenCalled();
    expect(() => disposeExperiencesRootSdkBinding(undefined)).not.toThrow();
    const runtime = sdk();
    disposeExperiencesRootSdkBinding(
      createExperiencesRootSdkBinding({ config, createSdk: () => runtime })
    );
    expect(runtime.destroy).toHaveBeenCalledOnce();
  });
});
