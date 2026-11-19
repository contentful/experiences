import {
  ContentfulExperiences,
  createWebSnapshotRuntime,
  type Config as WebConfig,
  type ExperiencesSnapshot,
  type WebExperiencesRuntime,
} from '@contentful/experiences-web';
import { resolvePreviewSessionId } from '@contentful/experiences-runtime';

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
  readonly owned: boolean;
  readonly sessionId: string | undefined;
  activate(): OwnerSnapshot;
  dispose(): void;
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

/** One native reactive owner per explicit activation; construction is browser-only. */
export function createRuntimeOwner(
  target: OwnerTarget,
  snapshot?: ExperiencesSnapshot
): RuntimeOwner {
  let current = $state.raw<OwnerSnapshot>({
    sdk: createWebSnapshotRuntime(snapshot),
    status: 'idle',
    error: undefined,
  });
  const owned = 'config' in target;
  const sessionId =
    (owned ? target.config.preview : target.sdk.isPreview) && typeof window !== 'undefined'
      ? resolvePreviewSessionId(new URLSearchParams(window.location.search))
      : undefined;
  let release: (() => void) | undefined;
  let busy = false;
  const disposed = () => current.status === 'disposed';

  function start(): OwnerSnapshot {
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
      sdk = 'config' in target ? new ContentfulExperiences(target.config) : target.sdk;
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
    owned,
    sessionId,
    activate() {
      if (typeof window === 'undefined' || busy || current.status !== 'idle') return current;
      return start();
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
