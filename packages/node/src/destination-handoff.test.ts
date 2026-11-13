import { profileFixture } from './test/profile.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExperiencePayload } from '@contentful/experiences-sdk-core';
import * as core from '@contentful/experiences-sdk-core';
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
    preview: { accessToken: 'preview-token' },
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

  describe.each([
    { destinationId: 'dest', path: '/products' },
    { destinationId: 'dest', nodeId: 'products-node' },
  ])('Preview Session Destination handoff %j', (selector) => {
    it.each(['delivery', 'resolution'] as const)(
      'returns %s failures in an identity-free handoff',
      async (source) => {
        const { sdk, fetch, commit } = setup();
        const failure = new TypeError(`${source} content failed`);
        const resolve = vi.spyOn(core, 'resolveExperience');
        if (source === 'delivery') fetch.mockRejectedValueOnce(failure);
        else resolve.mockRejectedValueOnce(failure);
        const session = vi.spyOn(sdk, 'fetchPreviewSessionPayload' as never);
        const request = sdk.forRequest({
          consent: true,
          preview: { sessionId: 'session' },
          profile: { id: 'visitor' },
        });

        await expect(
          request.fetchDestinationForHandoff(
            { ...selector, personalization: { events: [{ type: 'page' }] } },
            resolver,
            route
          )
        ).resolves.toEqual({
          handoff: {
            spaceId: 'space',
            environmentId: 'environment',
            cache: { scope: 'private-request' },
          },
          error: failure,
        });
        expect(fetch.mock.lastCall![0].personalization).toBeUndefined();
        expect(request.profile).toBeUndefined();
        expect(request.canPersistProfile).toBe(false);
        expect(session).not.toHaveBeenCalled();
        expect(commit).not.toHaveBeenCalled();
      }
    );

    it.each(['delivery', 'resolution'] as const)(
      'rejects disposal during %s instead of returning a content error',
      async (source) => {
        const { sdk, fetch, commit } = setup();
        const resolve = vi.spyOn(core, 'resolveExperience');
        let reject!: (error: Error) => void;
        const hold = new Promise<never>((_, rejectPromise) => (reject = rejectPromise));
        if (source === 'delivery') fetch.mockReturnValueOnce(hold);
        else resolve.mockReturnValueOnce(hold);
        const request = sdk.forRequest({ preview: { sessionId: 'session' } });
        const pending = request.fetchDestinationForHandoff(selector, resolver, route);
        await vi.waitFor(() => expect(source === 'delivery' ? fetch : resolve).toHaveBeenCalled());
        request.destroy();
        reject(new Error('late content failure'));

        await expect(pending).rejects.toThrow(/destroyed/);
        expect(request.profile).toBeUndefined();
        expect(commit).not.toHaveBeenCalled();
      }
    );

    it('returns Delivery redirects without replay or visitor identity', async () => {
      const { sdk, fetch, commit } = setup();
      fetch.mockResolvedValueOnce({ redirect: { path: '/new' } });
      const request = sdk.forRequest({ preview: { sessionId: 'session' } });

      await expect(
        request.fetchDestinationForHandoff(
          { ...selector, personalization: { events: [{ type: 'page' }] } },
          resolver,
          route
        )
      ).resolves.toEqual({
        handoff: {
          spaceId: 'space',
          environmentId: 'environment',
          cache: { scope: 'private-request' },
        },
        redirect: { path: '/new' },
      });
      expect(fetch.mock.lastCall![0].personalization).toBeUndefined();
      expect(commit).not.toHaveBeenCalled();
    });
  });

  it('drops personalization under Preview Session policy and keeps Delivery for Destinations', async () => {
    const onEventBlocked = vi.fn();
    const sdk = new TestRuntime({
      spaceId: 'space',
      environmentId: 'environment',
      delivery: { accessToken: 'token' },
      preview: { accessToken: 'preview-token' },
      onEventBlocked,
    });
    runtimes.push(sdk);
    const fetch = vi.spyOn(sdk, 'fetchDestinationPayload').mockResolvedValue(payload());
    const session = vi.spyOn(sdk, 'fetchPreviewSessionPayload' as never);
    const request = sdk.forRequest({
      consent: true,
      preview: { sessionId: 'session' },
      profile: { id: 'visitor' },
    });
    expect(request.isPreview).toBe(true);
    const plan = await request.fetchByDestinationPath(
      {
        destinationId: 'dest',
        path: '/a',
        personalization: { profileId: 'visitor', events: [{ type: 'page' }] },
      },
      resolver
    );
    expect(fetch.mock.lastCall![0].personalization).toBeUndefined();
    expect(onEventBlocked).toHaveBeenCalledWith(expect.objectContaining({ reason: 'preview' }));
    expect(session).not.toHaveBeenCalled();
    // Preview never adopts the returned visitor profile.
    expect(request.profile).toBeUndefined();
    expect(plan).toMatchObject({ experienceId: 'resolved-experience' });

    const handoff = await request.fetchDestinationForHandoff(
      { destinationId: 'dest', nodeId: 'n', personalization: { events: [{ type: 'page' }] } },
      resolver,
      route
    );
    expect(handoff.handoff.replay).toBeUndefined();
    expect(handoff.handoff.profileId).toBeUndefined();
    expect(fetch.mock.lastCall![0].personalization).toBeUndefined();
  });
});
