import { describe, expect, it, vi } from 'vitest';
import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';
import {
  assertPreviewRequest,
  createPreviewClient,
  fetchPreviewSession,
  mergePreviewResolveOptions,
  type LivePreviewConfig,
  type LivePreviewModule,
} from './live-preview.js';

const resolve = { config: { components: {} } };
const config: LivePreviewConfig = {
  spaceId: 'space',
  environmentId: 'master',
  preview: { accessToken: 'preview-token' },
  resolveDefaults: { metadata: { base: true, shared: 'base' }, debug: true },
};

function fixture() {
  const plan: PortableRenderPlan = { nodes: [], metadata: {}, debug: false, diagnostics: [] };
  const client = {
    getResult: () => ({ data: undefined, error: undefined }),
    subscribe: vi.fn(() => vi.fn()),
    subscribeStatus: vi.fn(() => vi.fn()),
  };
  const implementation = {
    fetchPreviewSession: vi.fn<LivePreviewModule['fetchPreviewSession']>().mockResolvedValue(plan),
    createLivePreviewClient: vi
      .fn<LivePreviewModule['createLivePreviewClient']>()
      .mockReturnValue(client),
    sendPreviewStatus: vi.fn(),
  };
  const binding = {
    experienceId: 'experience',
    sessionId: 'session',
    resourceResolution: 'resource',
    sessionHost: 'wss://session.test',
    implementation,
  };
  return { binding, implementation, plan, client };
}

describe('Runtime Live Preview wrapper', () => {
  it('maps the snapshot scope, endpoint and resolve options and adopts its plan', async () => {
    const { binding, implementation, plan } = fixture();
    const scoped = {
      ...config,
      preview: { accessToken: async () => 'token', host: 'https://preview.test' },
    };
    const preparedResolve = mergePreviewResolveOptions(scoped, {
      ...resolve,
      debug: false,
      metadata: { shared: 'operation' },
    });
    await expect(fetchPreviewSession(binding, scoped, preparedResolve)).resolves.toBe(plan);
    expect(implementation.fetchPreviewSession).toHaveBeenCalledWith(
      {
        spaceId: 'space',
        environmentId: 'master',
        sessionId: 'session',
        resourceResolution: 'resource',
      },
      { previewToken: 'token', host: 'https://preview.test' },
      { ...resolve, debug: false, metadata: { base: true, shared: 'operation' } }
    );
    expect(implementation.fetchPreviewSession.mock.calls[0]![2]).toBe(preparedResolve);
  });

  it('maps subscription credentials and session configuration into the public client', async () => {
    const { binding, implementation, client } = fixture();
    await expect(createPreviewClient(binding, config)).resolves.toBe(client);
    expect(implementation.createLivePreviewClient).toHaveBeenCalledWith({
      spaceId: 'space',
      environmentId: 'master',
      sessionId: 'session',
      resourceResolution: 'resource',
      previewToken: 'preview-token',
      sessionHost: 'wss://session.test',
      debug: true,
    });
  });

  it('requires a preview token before transport', async () => {
    const { binding, implementation } = fixture();
    await expect(
      fetchPreviewSession(
        binding,
        { ...config, preview: undefined },
        mergePreviewResolveOptions(config, resolve)
      )
    ).rejects.toThrow(/accessToken/);
    expect(implementation.fetchPreviewSession).not.toHaveBeenCalled();
  });

  it('evaluates the HTTP host supplier only for snapshots, not subscriptions', async () => {
    const { binding, implementation, client, plan } = fixture();
    const accessToken = vi.fn(async () => 'token');
    const host = vi.fn<() => Promise<string>>(async () => {
      throw new Error('HTTP endpoint unavailable');
    });
    const scoped = { ...config, preview: { accessToken, host } };
    await expect(createPreviewClient(binding, scoped)).resolves.toBe(client);
    expect(host).not.toHaveBeenCalled();
    expect(accessToken).toHaveBeenCalledOnce();
    expect(implementation.createLivePreviewClient).toHaveBeenCalledWith(
      expect.objectContaining({ previewToken: 'token', sessionHost: 'wss://session.test' })
    );

    host.mockResolvedValueOnce('https://preview.test');
    await expect(
      fetchPreviewSession(binding, scoped, mergePreviewResolveOptions(scoped, resolve))
    ).resolves.toBe(plan);
    expect(host).toHaveBeenCalledOnce();
    expect(implementation.fetchPreviewSession).toHaveBeenCalledWith(
      expect.anything(),
      { previewToken: 'token', host: 'https://preview.test' },
      expect.anything()
    );
  });

  it('rejects explicit session-owned request options', () => {
    for (const override of [{ locale: 'en-US' }, { parameters: {} }, { extensions: {} }]) {
      expect(() => assertPreviewRequest({ experienceId: 'experience', ...override })).toThrow(
        /server-owned/
      );
    }
  });
});
