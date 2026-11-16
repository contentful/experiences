import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PreviewConfig, ServerConfig } from './server-config.js';
import { bindAppRouterServerExperiences } from './app-router-server.js';
import { bindPagesRouterServerExperiences } from './pages-router-server.js';

const framework = vi.hoisted(() => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock('next/headers.js', () => framework);

const config = {
  spaceId: 'space',
  environmentId: 'master',
  delivery: { accessToken: 'delivery' },
  config: { components: {} },
};

afterEach(() => vi.restoreAllMocks());

describe.each([
  ['App Router', (options: ServerConfig) => bindAppRouterServerExperiences(options)],
  ['Pages Router', (options: ServerConfig) => bindPagesRouterServerExperiences(options)],
] as const)('%s server preview configuration', (_name, bind) => {
  it('rejects missing transport credentials at binding time', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const consent = vi.fn();
    const experience = vi.fn();
    expect(() =>
      bind({
        ...config,
        // Exercise JavaScript callers that bypass the public configuration type.
        preview: { accessToken: undefined } as PreviewConfig,
        consent: { server: consent },
        request: { experience },
      })
    ).toThrow('requires accessToken unless an explicit proxy host is provided');
    expect(framework.cookies).not.toHaveBeenCalled();
    expect(framework.headers).not.toHaveBeenCalled();
    expect(consent).not.toHaveBeenCalled();
    expect(experience).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([{ accessToken: vi.fn(() => 'preview') }, { host: 'https://example.com/preview' }])(
    'accepts configured transport without request work (%j)',
    (preview) => {
      const fetch = vi.spyOn(globalThis, 'fetch');
      const createClient = vi.fn<NonNullable<PreviewConfig['createClient']>>();
      expect(() => bind({ ...config, preview: { ...preview, createClient } })).not.toThrow();
      if (typeof preview.accessToken === 'function') {
        expect(preview.accessToken).not.toHaveBeenCalled();
      }
      expect(createClient).not.toHaveBeenCalled();
      expect(framework.cookies).not.toHaveBeenCalled();
      expect(framework.headers).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    }
  );
});
