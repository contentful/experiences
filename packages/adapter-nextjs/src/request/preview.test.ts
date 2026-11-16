import { expect, it, vi } from 'vitest';
import { resolvePreview, resolvePreviewSession } from './preview.js';
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
