const WEB_LOCK_KEY = '__ctfl_experiences_web_lock__';

interface WebLockState {
  owner: string | undefined;
}

type WebGlobal = typeof globalThis & {
  __ctfl_experiences_web_lock__?: WebLockState;
};

let nextOwnerId = 0;

function getWebLock(): WebLockState {
  const webGlobal = globalThis as WebGlobal;
  webGlobal[WEB_LOCK_KEY] ??= { owner: undefined };
  return webGlobal[WEB_LOCK_KEY];
}

/** One live Experiences Web SDK per JavaScript runtime. */
export function acquireWebSingleton(): string {
  const lock = getWebLock();
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
export function releaseWebSingleton(owner: string): void {
  const lock = getWebLock();
  if (lock.owner === owner) lock.owner = undefined;
}
