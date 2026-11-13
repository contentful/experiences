import { profileFixture } from './test/profile.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExperiencePayload } from '@contentful/experiences-sdk-core';
import type {
  BuiltFetchDestinationOptions,
  DestinationRedirectResult,
  FetchResolveOptions,
} from '@contentful/experiences-runtime';
import { ContentfulExperiences } from './contentful-experiences.js';

// Expose the actual Runtime Destination payload boundary for a no-network spy.
class TestRuntime extends ContentfulExperiences {
  override fetchDestinationPayload(
    options: BuiltFetchDestinationOptions,
    resolveOptions: FetchResolveOptions
  ): Promise<ExperiencePayload | DestinationRedirectResult> {
    return super.fetchDestinationPayload(options, resolveOptions);
  }
}

const resolver = { config: { components: {} } };
const route = { routeKey: '/products?tab=1' };
const runtimes: TestRuntime[] = [];
const payload = (profileId = 'xda-profile'): ExperiencePayload => ({
  sys: { id: 'resolved-experience' },
  nodes: [],
  extensions: { personalization: { profile: profileFixture(profileId) } },
});

function setup() {
  const sdk = new TestRuntime({
    spaceId: 'space',
    environmentId: 'environment',
    locale: 'en-US',
    delivery: { accessToken: 'token' },
  });
  runtimes.push(sdk);
  const fetch = vi.spyOn(sdk, 'fetchDestinationPayload').mockResolvedValue(payload());
  const commit = vi.spyOn(sdk.api.personalization, 'upsertProfile');
  return { sdk, fetch, commit, request: sdk.forRequest({ consent: true }) };
}

afterEach(() => {
  for (const sdk of runtimes.splice(0)) sdk.destroy();
  vi.restoreAllMocks();
});

describe('Node Destination handoff producer', () => {
  it.each([
    { destinationId: 'dest', path: '/products' },
    { destinationId: 'dest', nodeId: 'products-node' },
  ])(
    'previews %j without commitment and carries replay, identity and resolved id',
    async (selector) => {
      const { request, fetch, commit } = setup();
      const result = await request.fetchDestinationForHandoff(
        {
          ...selector,
          personalization: { events: [{ type: 'page', properties: { path: '/products' } }] },
        },
        resolver,
        route
      );
      const [sent] = fetch.mock.lastCall!;
      expect(sent).toMatchObject(selector);
      expect(sent.personalization?.preflight).toBe(true);
      expect(sent.personalization?.events).toEqual([expect.objectContaining({ type: 'page' })]);
      expect(result.plan?.experienceId).toBe('resolved-experience');
      expect(result.redirect).toBeUndefined();
      expect(result.handoff).toMatchObject({
        cache: { scope: 'private-request' },
        profileId: 'xda-profile',
        state: { profile: profileFixture('xda-profile') },
        replay: { routeKey: '/products?tab=1', locale: 'en-US' },
      });
      expect(result.handoff.replay?.events).toEqual(sent.personalization?.events);
      expect(request.profile?.id).toBe('xda-profile');
      expect(commit).not.toHaveBeenCalled();
    }
  );

  it('rejects explicit commitment and non-Destination selectors before transport', async () => {
    const { request, fetch } = setup();
    await expect(
      request.fetchDestinationForHandoff(
        { destinationId: 'dest', path: '/a', personalization: { preflight: false } },
        resolver,
        route
      )
    ).rejects.toThrow(/preflight: true/);
    expect(() =>
      request.fetchDestinationForHandoff({ experienceId: 'exp' } as never, resolver, route)
    ).toThrow(TypeError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns a redirect outcome without plan or replay', async () => {
    const { request, fetch } = setup();
    fetch.mockResolvedValueOnce({ redirect: { path: '/new' } });
    const result = await request.fetchDestinationForHandoff(
      { destinationId: 'dest', path: '/old', personalization: { events: [{ type: 'page' }] } },
      resolver,
      route
    );
    expect(result.redirect).toEqual({ path: '/new' });
    expect(result.plan).toBeUndefined();
    expect(result.error).toBeUndefined();
    expect(result.handoff.replay).toBeUndefined();
  });

  it('retains evaluated replay when content resolution fails, including not-found', async () => {
    const { request, fetch } = setup();
    const notFound = Object.assign(new Error('missing'), { name: 'NotFoundError' });
    fetch.mockRejectedValueOnce(notFound);
    const result = await request.fetchDestinationForHandoff(
      { destinationId: 'dest', nodeId: 'missing', personalization: { events: [{ type: 'page' }] } },
      resolver,
      route
    );
    expect(result.error).toBe(notFound);
    expect(result.handoff.replay?.events).toHaveLength(1);
  });

  it('drops consent-blocked intent and discards results after request destruction', async () => {
    const { sdk, fetch } = setup();
    const blocked = sdk.forRequest({ consent: false });
    await blocked.fetchDestinationForHandoff(
      {
        destinationId: 'dest',
        path: '/a',
        personalization: { events: [{ type: 'track', event: 'x' }, { type: 'page' }] },
      },
      resolver,
      route
    );
    expect(fetch.mock.lastCall![0].personalization?.events?.map((event) => event.type)).toEqual([
      'page',
    ]);

    const request = sdk.forRequest({ consent: true });
    let release!: (value: ExperiencePayload) => void;
    fetch.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
    const pending = request.fetchDestinationForHandoff(
      { destinationId: 'dest', path: '/a' },
      resolver,
      route
    );
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    request.destroy();
    release(payload());
    await expect(pending).rejects.toThrow(/destroyed/);
  });
});
