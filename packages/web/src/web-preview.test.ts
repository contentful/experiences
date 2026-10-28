// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import type {
  RuntimeLivePreviewBinding,
  RuntimePreviewClient,
} from '@contentful/experiences-runtime';
import { WebPreview } from './web-preview.js';
import { preview } from './signals/signals.js';
import { deferred } from './test-fixtures/dom.js';

const config = {
  spaceId: 'space',
  environmentId: 'master',
  delivery: { accessToken: 'delivery' },
  preview: { accessToken: 'preview' },
  eventBuilder: { channel: 'web' as const },
};
const owners: WebPreview[] = [];
afterEach(() => {
  owners.splice(0).forEach((owner) => owner.destroy());
  preview.value = undefined;
});
function fixture(experienceId = 'hero') {
  let update = () => {};
  const stop = vi.fn(),
    stopStatus = vi.fn();
  let result: ReturnType<RuntimePreviewClient['getResult']> = { data: undefined, error: undefined };
  const binding: RuntimeLivePreviewBinding = {
    experienceId,
    sessionId: 'session',
    implementation: {
      fetchPreviewSession: vi.fn(),
      sendPreviewStatus: vi.fn(),
      createLivePreviewClient: vi.fn(() => ({
        getResult: () => result,
        subscribe: (next: () => void) => {
          update = next;
          return stop;
        },
        subscribeStatus: (next: (status: 'live') => void) => {
          next('live');
          return stopStatus;
        },
      })),
    },
  };
  const create = (initializer = () => Promise.resolve(binding)) => {
    const owner = new WebPreview(config, initializer);
    owners.push(owner);
    return owner;
  };
  return {
    binding,
    create,
    stop,
    stopStatus,
    emit() {
      result = { data: { sys: { type: 'Experience' }, nodes: [] }, error: undefined };
      update();
      return result.data;
    },
    notify: () => update(),
  };
}

it('publishes one SDK-owned source and releases its subscriptions on destruction', async () => {
  const f = fixture(),
    owner = f.create();
  await owner.ready();
  await vi.waitFor(() => expect(preview.peek()?.status).toBe('live'));
  const payload = f.emit();
  expect(preview.peek()).toMatchObject({ experienceId: 'hero', sessionId: 'session', revision: 1 });
  expect(preview.peek()?.data).toBe(payload);
  owner.clear();
  f.notify();
  expect(preview.peek()?.data).toBeUndefined();
  owner.destroy();
  expect(f.stop).toHaveBeenCalledOnce();
  expect(f.stopStatus).toHaveBeenCalledOnce();
  expect(preview.peek()).toBeUndefined();
});

it('ignores an obsolete initializer after replacing the session', async () => {
  const old = fixture('old'),
    fresh = fixture('fresh');
  const pending = deferred<RuntimeLivePreviewBinding>();
  const owner = old.create(() => pending.promise);
  const initial = owner.ready();
  await owner.replace(() => fresh.binding);
  pending.resolve(old.binding);
  await initial;
  expect(preview.peek()?.experienceId).toBe('fresh');
  expect(old.binding.implementation.createLivePreviewClient).not.toHaveBeenCalled();
});

it('reports initialization failure through state even without a content fetch', async () => {
  const f = fixture();
  const owner = f.create(async () => {
    throw new Error('module unavailable');
  });
  await expect(owner.ready()).rejects.toThrow('module unavailable');
  expect(preview.peek()?.error?.message).toBe('module unavailable');
  expect(f.binding.implementation.createLivePreviewClient).not.toHaveBeenCalled();
});
