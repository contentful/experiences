import { expect, it, vi } from 'vitest';
import { mergePreview, resolvePreview, resolvePreviewSession } from './preview.js';
import type { PreviewClientFactory } from '@contentful/experiences-runtime';

function clientFactory() {
  return vi.fn<PreviewClientFactory>(() => ({
    getResult: () => ({ data: undefined, error: undefined }),
    subscribe: () => () => {},
    subscribeStatus: () => () => {},
  }));
}

it.each([
  [false, '?preview_session_id=a', undefined],
  [true, '?preview_session_id=%20a%20&preview_experience_id=other', 'a'],
] as const)(
  'activates only configured nonempty URL sessions (%s, %s)',
  async (configured, search, expected) => {
    const createClient = clientFactory();
    const config = configured ? { accessToken: 'preview', createClient } : undefined;
    const previewOptions = resolvePreview(config, '/' + search);
    expect(createClient).not.toHaveBeenCalled();
    expect(resolvePreviewSession(config, '/' + search)?.sessionId).toBe(expected);
    expect(previewOptions?.createClient).toBe(configured ? createClient : undefined);
  }
);

it('merges only defined Preview overrides without mutating either input', () => {
  const configured = Object.freeze({
    accessToken: 'preview',
    createClient: clientFactory(),
    sessionHost: 'https://session.example',
    resourceResolution: 'resolved',
    maxRetries: 3,
  });
  const supplied = Object.freeze({
    accessToken: undefined,
    createClient: undefined,
    sessionHost: undefined,
    resourceResolution: 'raw',
    maxRetries: 0,
  });
  const merged = mergePreview(configured, supplied);
  expect(merged).toEqual({ ...configured, resourceResolution: 'raw', maxRetries: 0 });
  expect(resolvePreview(merged, '/?preview_session_id=a')).toEqual(merged);
  expect(mergePreview(configured, undefined)).toBe(configured);
  expect(mergePreview(undefined, undefined)).toBeUndefined();
  expect(mergePreview(undefined, { host: 'https://proxy.example' })).toEqual({
    host: 'https://proxy.example',
  });
  expect(resolvePreview({ host: 'https://proxy.example' }, '/?preview_session_id=a')).toEqual({
    accessToken: undefined,
    host: 'https://proxy.example',
  });
});

it('requires browser transport credentials only when a partial Preview configuration is active', () => {
  const context = { sessionHost: 'https://session.example' };
  expect(resolvePreview(context, '/')).toBeUndefined();
  expect(() => resolvePreview(context, '/?preview_session_id=a')).toThrow(
    'Browser Preview requires preview.accessToken or an explicit trusted proxy preview.host. ' +
      'preview.sessionHost does not supply API authentication. Server credentials are not copied to browser roots.'
  );
});
