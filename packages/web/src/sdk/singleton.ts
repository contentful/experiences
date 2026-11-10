const WEB_LOCK_KEY = '__ctfl_experiences_web_lock__';

interface LockState {
  owner: string | undefined;
}

type GlobalWithLock = typeof globalThis & {
  __ctfl_experiences_web_lock__?: LockState;
};

let nextOwnerId = 0;

function getLock(): LockState {
  const globalWithLock = globalThis as GlobalWithLock;
  globalWithLock[WEB_LOCK_KEY] ??= { owner: undefined };
  return globalWithLock[WEB_LOCK_KEY];
}

/** One live Experiences Web SDK per JavaScript runtime. */
export function acquireSingleton(): string {
  const lock = getLock();
  if (lock.owner) {
    throw new Error(
      `Experiences Web SDK already initialized (${lock.owner}). Only one Web SDK instance is supported per runtime.`
    );
  }

  const owner = `ContentfulExperiencesWeb#${++nextOwnerId}`;
  lock.owner = owner;
  return owner;
}

/** A stale owner cannot release a replacement Web SDK instance. */
export function releaseSingleton(owner: string): void {
  const lock = getLock();
  if (lock.owner === owner) lock.owner = undefined;
}
