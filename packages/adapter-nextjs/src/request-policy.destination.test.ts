import {
  ExperienceFetchError,
  NotFoundError,
  type RequestRuntime,
} from '@contentful/experiences-node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resolveRequestPolicy as resolvePolicy,
  loadPrimaryExperience as loadPrimary,
} from './request-policy.js';
import { profileFixture } from '../../adapter-react/src/test/profile.js';
import {
  serializeRequestResult,
  type ServerConfig,
  type ServerRequestContext,
} from './server-config.js';
import { getRequestOutcome } from './request-outcome.js';
import { getPagesRouterOutcome } from './pages-router-server.js';

const byPath = { destinationId: 'dest', path: '/products' };
const byNode = { destinationId: 'dest', nodeId: 'products-node' };
const config: ServerConfig = {
  spaceId: 'space',
  environmentId: 'master',
  delivery: { accessToken: 'server' },
  config: { components: {} },
  request: { experience: byPath },
};
const context: ServerRequestContext = {
  request: { url: 'https://example.com/products?tab=1', headers: new globalThis.Headers() },
  headers: new globalThis.Headers(),
  cookies: { get: () => undefined },
  requestUrl: 'https://example.com/products?tab=1',
  routeKey: '/products?tab=1',
};
const plan = { nodes: [], diagnostics: [], metadata: {}, debug: false, experienceId: 'resolved' };
const handoff = {
  spaceId: 'space',
  environmentId: 'master',
  cache: { scope: 'private-request' as const },
  profileId: 'xda',
  replay: { routeKey: '/products?tab=1', events: [] },
};
const fetchByDestinationPath = vi.fn<RequestRuntime['fetchByDestinationPath']>();
const fetchByDestinationNode = vi.fn<RequestRuntime['fetchByDestinationNode']>();
const fetchDestinationForHandoff = vi.fn<RequestRuntime['fetchDestinationForHandoff']>();
const fetchExperience = vi.fn<RequestRuntime['fetchExperience']>();
const fetchExperienceForHandoff = vi.fn<RequestRuntime['fetchExperienceForHandoff']>();
const request = {
  isPreview: false,
  fetchByDestinationPath,
  fetchByDestinationNode,
  fetchDestinationForHandoff,
  fetchExperience,
  fetchExperienceForHandoff,
} as unknown as RequestRuntime;

describe('Next Destination primary', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    fetchByDestinationPath.mockResolvedValue(plan);
    fetchByDestinationNode.mockResolvedValue(plan);
    fetchDestinationForHandoff.mockResolvedValue({ handoff, plan });
  });

  it.each([
    ['path', byPath, fetchByDestinationPath],
    ['node', byNode, fetchByDestinationNode],
  ] as const)(
    'SSR fetches by %s with committed page intent and server page ownership',
    async (_label, selector, fetch) => {
      const profile = profileFixture('evaluated');
      fetch.mockResolvedValueOnce({ ...plan, personalization: { profile } });
      const resolved = await resolvePolicy(config, { mode: 'ssr', experience: selector }, context);
      expect(resolved.result.experienceId).toBeUndefined();
      const result = await loadPrimary(request, resolved, context, config);
      expect(fetch).toHaveBeenCalledExactlyOnceWith(
        {
          ...selector,
          personalization: {
            events: [{ type: 'page', properties: expect.objectContaining({ path: '/products' }) }],
          },
        },
        { config: config.config }
      );
      expect(fetchDestinationForHandoff).not.toHaveBeenCalled();
      expect(fetchExperience).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        experienceId: 'resolved',
        experience: selector,
        initialPageOwner: 'server',
        handoff: { profileId: profile.id, state: { profile } },
      });
      expect(result.handoff?.replay).toBeUndefined();
      const browser = serializeRequestResult(result);
      expect(browser.experience).toEqual(selector);
      expect(browser.plan?.experienceId).toBe('resolved');
    }
  );

  it('hybrid transfers use the Destination handoff with server preflight for browser replay', async () => {
    const resolved = await resolvePolicy(config, {}, context);
    const result = await loadPrimary(request, resolved, context, config);
    expect(fetchDestinationForHandoff).toHaveBeenCalledExactlyOnceWith(
      { ...byPath, personalization: { events: [expect.objectContaining({ type: 'page' })] } },
      { config: config.config },
      { routeKey: '/products?tab=1' }
    );
    expect(fetchByDestinationPath).not.toHaveBeenCalled();
    expect(result.initialPageOwner).toBeUndefined();
    expect(result.handoff).toMatchObject({ replay: { routeKey: '/products?tab=1' } });
    expect(result.initialPagePayload).toBeDefined();
  });

  it.each(['ssr', 'hybrid'] as const)(
    'carries %s redirects as explicit outcomes without handoff, page owner or page payload',
    async (mode) => {
      fetchByDestinationPath.mockResolvedValueOnce({ redirect: { path: '/new' } });
      fetchDestinationForHandoff.mockResolvedValueOnce({
        handoff: { ...handoff, replay: undefined },
        redirect: { path: '/new' },
      });
      const composeRequest = vi.fn();
      const resolved = await resolvePolicy(config, { mode, composeRequest }, context);
      const result = await loadPrimary(request, resolved, context, config);
      expect(result.redirect).toEqual({ path: '/new' });
      expect(result.plan).toBeUndefined();
      expect(result.handoff).toBeUndefined();
      expect(result.initialPageOwner).toBeUndefined();
      expect(result.initialPagePayload).toBeUndefined();
      expect(result.experienceId).toBeUndefined();
      expect(composeRequest).toHaveBeenCalledWith(
        request,
        expect.objectContaining({ redirect: { path: '/new' } }),
        context
      );
      // Survives the browser projection and maps to framework redirects.
      const browser = serializeRequestResult(result);
      expect(browser.redirect).toEqual({ path: '/new' });
      expect(getRequestOutcome(browser)).toEqual({ kind: 'redirect', location: '/new' });
      expect(
        getPagesRouterOutcome(browser, { redirectLocation: (path) => `/shop${path}` })
      ).toEqual({ redirect: { destination: '/shop/new', permanent: false } });
    }
  );

  it.each(['ssr', 'hybrid'] as const)(
    'maps %s missing Destinations, paths and nodes to normal 404 handling',
    async (mode) => {
      const missing = new NotFoundError('missing');
      fetchByDestinationPath.mockRejectedValueOnce(missing);
      fetchDestinationForHandoff.mockResolvedValueOnce({ handoff, error: missing });
      const result = await loadPrimary(
        request,
        await resolvePolicy(config, { mode }, context),
        context,
        config
      );
      expect(result).toMatchObject({ notFound: true, contentError: expect.any(String) });
      const browser = serializeRequestResult(result);
      expect(browser.notFound).toBe(true);
      expect(getPagesRouterOutcome(browser)).toEqual({ notFound: true });
    }
  );

  it('keeps other Delivery failures as content errors without a 404 outcome', async () => {
    fetchByDestinationNode.mockRejectedValueOnce(
      new ExperienceFetchError('unavailable', { spaceId: 'space', experienceId: 'node' })
    );
    const result = await loadPrimary(
      request,
      await resolvePolicy(config, { mode: 'ssr', experience: byNode }, context),
      context,
      config
    );
    expect(result.contentError).toBeDefined();
    expect(result.notFound).toBeUndefined();
    expect(getRequestOutcome(result)).toBeUndefined();
  });

  it('rejects ambiguous or unsupported primary selectors before fetching', async () => {
    for (const experience of [
      { experienceId: 'home', destinationId: 'dest', path: '/a' },
      { destinationId: 'dest', path: '/a', nodeId: 'b' },
      { destinationId: 'dest', path: '/a', locale: 'de-DE' },
    ])
      await expect(
        resolvePolicy(config, { experience: experience as never }, context)
      ).rejects.toThrow(TypeError);
  });

  it('forwards explicit page-free Destination intent to the browser descriptor', async () => {
    const resolved = await resolvePolicy(
      config,
      {
        mode: 'ssr',
        experience: { ...byPath, personalization: { events: [{ type: 'track', event: 'x' }] } },
      },
      context
    );
    expect(resolved.result.experience).toEqual({ ...byPath, personalization: { events: [] } });
  });
});
