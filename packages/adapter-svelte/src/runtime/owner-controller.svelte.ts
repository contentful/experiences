import {
  ContentfulExperiences,
  createWebSnapshotRuntime,
  type Config as WebConfig,
  type ExperiencesSnapshot,
  type WebExperiencesRuntime,
} from '@contentful/experiences-web';

export type OnStatesReady = (states: WebExperiencesRuntime['states']) => void | (() => void);

export type OwnedOwnerTarget = { config: WebConfig; onStatesReady?: OnStatesReady };
export type InjectedOwnerTarget = {
  sdk: ContentfulExperiences;
  onStatesReady?: OnStatesReady;
};
export type OwnerTarget = OwnedOwnerTarget | InjectedOwnerTarget;

export interface OwnerSnapshot {
  readonly sdk: WebExperiencesRuntime;
  readonly status: 'idle' | 'ready' | 'error' | 'disposed';
  readonly error: Error | undefined;
}

export interface RuntimeOwner {
  readonly current: OwnerSnapshot;
  activate(target: OwnerTarget): OwnerSnapshot;
  rebindInjected(target: InjectedOwnerTarget): OwnerSnapshot;
  dispose(): void;
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

/** One native reactive owner per explicit activation; construction is browser-only. */
export function createRuntimeOwner(snapshot?: ExperiencesSnapshot): RuntimeOwner {
  let current = $state.raw<OwnerSnapshot>({
    sdk: createWebSnapshotRuntime(snapshot),
    status: 'idle',
    error: undefined,
  });
  let attemptedTarget: OwnerTarget | undefined;
  let release: (() => void) | undefined;
  let busy = false;
  const disposed = () => current.status === 'disposed';

  function start(target: OwnerTarget): OwnerSnapshot {
    let sdk: ContentfulExperiences | undefined;
    let cleanup: void | (() => void);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      try {
        cleanup?.();
      } finally {
        if (!('sdk' in target)) sdk?.destroy();
      }
    };
    busy = true;
    try {
      sdk = 'sdk' in target ? target.sdk : new ContentfulExperiences(target.config);
      if (!disposed()) cleanup = target.onStatesReady?.(sdk.states);
      if (disposed()) {
        close();
      } else {
        release = close;
        current = { sdk, status: 'ready', error: undefined };
      }
    } catch (error) {
      let failure = error;
      try {
        close();
      } catch (cleanupError) {
        failure = new AggregateError(
          [error, cleanupError],
          'Experiences runtime setup and cleanup failed.'
        );
      }
      if (!disposed()) current = { ...current, status: 'error', error: asError(failure) };
    } finally {
      busy = false;
    }
    return current;
  }

  return {
    get current() {
      return current;
    },
    activate(target) {
      if (typeof window === 'undefined' || busy || attemptedTarget || disposed()) return current;
      attemptedTarget = target;
      return start(target);
    },
    rebindInjected(target) {
      if (disposed() || busy) return current;
      if (!attemptedTarget || !('sdk' in attemptedTarget)) {
        throw new TypeError('Only an injected runtime owner can rebind an SDK.');
      }
      if (attemptedTarget.sdk === target.sdk) return current;
      attemptedTarget = target;
      const previous = release;
      release = undefined;
      current = { sdk: createWebSnapshotRuntime(), status: 'idle', error: undefined };
      busy = true;
      try {
        previous?.();
      } catch (error) {
        if (!disposed()) current = { ...current, status: 'error', error: asError(error) };
        return current;
      } finally {
        busy = false;
      }
      return disposed() ? current : start(target);
    },
    dispose() {
      if (disposed()) return;
      const previous = release;
      release = undefined;
      current = { sdk: createWebSnapshotRuntime(), status: 'disposed', error: undefined };
      try {
        previous?.();
      } catch (error) {
        current = { ...current, error: asError(error) };
      }
    },
  };
}
