import { afterEach, describe, expect, it, vi } from 'vitest';

import { ContentfulExperiences, type ExperiencesNodeConfig } from './contentful-experiences.js';

const instances: ContentfulExperiences[] = [];
const resolverConfig = { components: {} };

function setup(policy: Pick<ExperiencesNodeConfig, 'allowedEventTypes' | 'onEventBlocked'> = {}) {
  const sdk = new ContentfulExperiences({
    spaceId: 'space',
    environmentId: 'env',
    delivery: { accessToken: 'token' },
    ...policy,
  });
  instances.push(sdk);
  return sdk;
}

afterEach(() => {
  for (const sdk of instances.splice(0)) sdk.destroy();
});

type Request = ReturnType<ContentfulExperiences['forRequest']>;
type Personalization = { profileId?: string; events?: unknown[] };

// Destination fetches share one code path with by-id, so each case runs for both.
const cases = [
  {
    label: 'by node id',
    method: 'fetchByDestinationNode',
    locator: { destinationId: 'dest', nodeId: 'node' },
    fetchIt: (request: Request, personalization?: Personalization) =>
      request.fetchByDestinationNode(
        { destinationId: 'dest', nodeId: 'node', personalization } as never,
        { config: resolverConfig }
      ),
  },
  {
    label: 'by path',
    method: 'fetchByDestinationPath',
    locator: { destinationId: 'dest', path: '/page' },
    fetchIt: (request: Request, personalization?: Personalization) =>
      request.fetchByDestinationPath(
        { destinationId: 'dest', path: '/page', personalization } as never,
        { config: resolverConfig }
      ),
  },
] as const;

describe.each(cases)('Node Destination fetch $label', ({ method, locator, fetchIt }) => {
  const spyOnRuntime = (sdk: ContentfulExperiences, result: object = { nodes: [] }) =>
    vi.spyOn(sdk, method).mockResolvedValue(result as never);

  it('forwards personalization to the runtime', async () => {
    const sdk = setup();
    const fetch = spyOnRuntime(sdk);
    const page = sdk.eventBuilder.buildPageView();

    await fetchIt(sdk.forRequest({ consent: { events: true } }), {
      profileId: 'explicit',
      events: [page],
    });

    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      { ...locator, personalization: { profileId: 'explicit', events: [page] } },
      expect.anything()
    );
  });

  it("sends the request's profile id", async () => {
    const sdk = setup();
    const fetch = spyOnRuntime(sdk);

    await fetchIt(sdk.forRequest({ profile: { id: 'initial' }, consent: { events: true } }));

    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      { ...locator, personalization: { profileId: 'initial' } },
      expect.anything()
    );
  });

  it('lets an explicit profile id win over the request profile', async () => {
    const sdk = setup();
    const fetch = spyOnRuntime(sdk);

    await fetchIt(sdk.forRequest({ profile: { id: 'initial' } }), { profileId: 'explicit' });

    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      { ...locator, personalization: { profileId: 'explicit' } },
      expect.anything()
    );
  });

  it('keeps the profile id XDA returns on the request', async () => {
    const sdk = setup();
    spyOnRuntime(sdk, { nodes: [], personalization: { profileId: 'returned' } });
    const request = sdk.forRequest({ profile: { id: 'initial' } });

    await fetchIt(request);

    expect(request.profile).toEqual({ id: 'returned' });
  });

  it('returns a redirect unchanged and leaves the profile alone', async () => {
    const sdk = setup();
    spyOnRuntime(sdk, { redirect: { path: '/elsewhere' } });
    const request = sdk.forRequest({ profile: { id: 'initial' } });

    await expect(fetchIt(request)).resolves.toEqual({ redirect: { path: '/elsewhere' } });
    expect(request.profile).toEqual({ id: 'initial' });
  });

  it('drops caller-built events that consent does not admit and reports them', async () => {
    const onEventBlocked = vi.fn();
    const sdk = setup({ onEventBlocked });
    const fetch = spyOnRuntime(sdk);
    const page = sdk.eventBuilder.buildPageView();
    const track = sdk.eventBuilder.buildTrack({ event: 'clicked' });

    await fetchIt(sdk.forRequest({ consent: { events: false } }), { events: [page, track] });

    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      { ...locator, personalization: { events: [page] } },
      expect.anything()
    );
    expect(onEventBlocked).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'consent', method: 'track' })
    );
  });

  it('runs event interceptors on caller-built events before sending', async () => {
    const sdk = setup();
    const fetch = spyOnRuntime(sdk);
    sdk.interceptors.event.add((event) => {
      event.context.userAgent = 'redacted';
      return event;
    });

    await fetchIt(sdk.forRequest({ consent: { events: true } }), {
      events: [sdk.eventBuilder.buildPageView()],
    });

    const sent = fetch.mock.calls[0]?.[0].personalization?.events?.[0];
    expect(sent?.context.userAgent).toBe('redacted');
  });

  it('rejects an interceptor result XDA would not accept, before any request', async () => {
    const sdk = setup();
    const fetch = spyOnRuntime(sdk);
    sdk.interceptors.event.add(() => ({ type: 'track' }) as never);

    await expect(
      fetchIt(sdk.forRequest({ consent: { events: true } }), {
        events: [sdk.eventBuilder.buildPageView()],
      })
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
