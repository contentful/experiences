const RUNTIME_LOCK_KEY = '__ctfl_experiences_runtime_lock__';

interface RuntimeLockState {
  owner: string | undefined;
}

type RuntimeGlobal = typeof globalThis & {
  __ctfl_experiences_runtime_lock__?: RuntimeLockState;
};

let nextOwnerId = 0;

function getRuntimeLock(): RuntimeLockState {
  const runtimeGlobal = globalThis as RuntimeGlobal;
  runtimeGlobal[RUNTIME_LOCK_KEY] ??= { owner: undefined };
  return runtimeGlobal[RUNTIME_LOCK_KEY];
}

/** One live Experiences SDK base, Node, or Web runtime per JavaScript runtime. */
export function acquireRuntimeSingleton(): string {
  const lock = getRuntimeLock();
  if (lock.owner) {
    throw new Error(
      `Experiences SDK already initialized (${lock.owner}). Only one SDK instance is supported per runtime.`
    );
  }

  const owner = `ContentfulExperiences#${++nextOwnerId}`;
  lock.owner = owner;
  return owner;
}

/** A stale owner cannot release a replacement SDK instance. */
export function releaseRuntimeSingleton(owner: string): void {
  const lock = getRuntimeLock();
  if (lock.owner === owner) lock.owner = undefined;
}
