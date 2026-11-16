// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import type { RuntimePreviewConfig, RuntimePreviewClient } from '@contentful/experiences-runtime';
import { WebPreview } from './web-preview.js';
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
  vi.unstubAllGlobals();
});
function fixture(sessionId = 'session') {
  let update = () => {};
  const stop = vi.fn(),
    stopStatus = vi.fn();
  let result: ReturnType<RuntimePreviewClient['getResult']> = { data: undefined, error: undefined };
  const client: RuntimePreviewClient = {
    getResult: () => result,
    subscribe: vi.fn((next: () => void) => {
      update = next;
      return stop;
    }),
    subscribeStatus: (next) => {
      next('live');
      return stopStatus;
    },
  };
  const createClient = vi.fn(() => client);
  const create = (accessToken: RuntimePreviewConfig['accessToken'] = 'preview') => {
    const owner = new WebPreview(
      { ...config, preview: { accessToken, createClient } },
      { sessionId }
    );
    owners.push(owner);
    owner.start();
    return owner;
  };
  return {
    client,
    createClient,
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

it('creates one live client, reports editor status and releases its subscriptions', async () => {
  const postMessage = vi.fn();
  vi.stubGlobal('window', { parent: { postMessage } });
  const f = fixture(),
    owner = f.create();
  await vi.waitFor(() => expect(owner.state.peek()?.status).toBe('live'));
  expect(postMessage).toHaveBeenCalledExactlyOnceWith(
    { source: 'experiences/live-preview', type: 'status', status: 'live' },
    '*'
  );
  const payload = f.emit();
  expect(owner.state.peek()).toMatchObject({
    sessionId: 'session',
    revision: 1,
  });
  expect(owner.state.peek()?.data).toBe(payload);
  owner.clear();
  f.notify();
  expect(owner.state.peek()?.data).toBeUndefined();
  owner.destroy();
  expect(f.stop).toHaveBeenCalledOnce();
  expect(f.stopStatus).toHaveBeenCalledOnce();
  expect(owner.state.peek()).toBeUndefined();
});

it('does not subscribe after destruction while credentials are pending', async () => {
  const f = fixture();
  const token = deferred<string>();
  const owner = f.create(() => token.promise);
  owner.destroy();
  token.resolve('preview');
  await vi.waitFor(() => expect(f.createClient).toHaveBeenCalledOnce());
  expect(f.client.subscribe).not.toHaveBeenCalled();
  expect(owner.state.peek()).toBeUndefined();
});

it('reports subscription failure through state even without a content fetch', async () => {
  const f = fixture();
  vi.mocked(f.client.subscribe).mockImplementation(() => {
    throw new Error('client unavailable');
  });
  const owner = f.create();
  await vi.waitFor(() => expect(owner.state.peek()?.error?.message).toBe('client unavailable'));
});
