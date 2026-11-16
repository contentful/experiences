import { describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '@contentful/experiences-client';
import {
  assertRuntimePreviewRequest,
  createRuntimePreviewClient,
  fetchRuntimePreviewSessionPayload,
} from './live-preview.js';

describe('Runtime Live Preview wrapper', () => {
  it('maps the raw snapshot route and retains its Experience identity', async () => {
    const payload = { sys: { id: 'edited', type: 'Experience' }, nodes: [] };
    const fetch = vi.fn().mockResolvedValue(globalThis.Response.json(payload));
    await expect(
      fetchRuntimePreviewSessionPayload(
        {
          spaceId: 'space/id',
          environmentId: 'master',
          sessionId: 'session/id',
          resourceResolution: 'encoded=value',
        },
        { fetch }
      )
    ).resolves.toEqual(payload);
    expect(fetch).toHaveBeenCalledWith(
      '/spaces/space%2Fid/environments/master/preview_sessions/session%2Fid/experience?resource_resolution=encoded%3Dvalue'
    );
  });

  it.each([
    [new globalThis.Response(null, { status: 404 }), NotFoundError],
    [new globalThis.Response(null, { status: 500 }), /HTTP 500/],
    [globalThis.Response.json({ nodes: [], sys: { type: 'Entry' } }), /valid Experience/],
  ])(
    'preserves missing-session errors and rejects failed or invalid snapshots',
    async (response, error) => {
      const fetch = vi.fn().mockResolvedValue(response);
      await expect(
        fetchRuntimePreviewSessionPayload(
          {
            spaceId: 'space',
            environmentId: 'master',
            sessionId: 'session',
          },
          { fetch }
        )
      ).rejects.toThrow(error);
    }
  );

  it('passes session context and evaluated credentials to the Preview package factory', async () => {
    const client = {
      getResult: () => ({ data: undefined, error: undefined }),
      subscribe: vi.fn(() => vi.fn()),
      subscribeStatus: vi.fn(() => vi.fn()),
    };
    const createClient = vi.fn(() => client);
    const accessToken = vi.fn(async () => 'preview-token');
    const host = vi.fn(() => 'https://preview.test');
    const config = {
      spaceId: 'space',
      environmentId: 'master',
      preview: { accessToken, host, createClient },
      resolveDefaults: { debug: true },
    };
    const session = {
      sessionId: 'session',
      sessionHost: 'wss://preview.test',
      resourceResolution: 'resource',
    };
    await expect(createRuntimePreviewClient(session, config)).resolves.toBe(client);
    expect(createClient).toHaveBeenCalledExactlyOnceWith({
      ...session,
      spaceId: 'space',
      environmentId: 'master',
      previewToken: 'preview-token',
      debug: true,
    });
    expect(accessToken).toHaveBeenCalledOnce();
    expect(host).not.toHaveBeenCalled();
    await expect(
      createRuntimePreviewClient(session, { ...config, preview: { host, createClient } })
    ).rejects.toThrow(/accessToken/);
  });

  it('rejects explicit session-owned request options', () => {
    for (const override of [{ locale: 'en-US' }, { parameters: {} }, { extensions: {} }]) {
      expect(() =>
        assertRuntimePreviewRequest({ experienceId: 'experience', ...override })
      ).toThrow(/server-owned/);
    }
  });
});
