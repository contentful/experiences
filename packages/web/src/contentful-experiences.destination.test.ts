// @vitest-environment jsdom

import { completeProfile as profileFixture } from './test-fixtures/profile.js';
import { ContentfulExperiences as RuntimeContentfulExperiences } from '@contentful/experiences-runtime';
import {
  ExperienceApiClient as PersonalizationApiClient,
  InsightsApiClient as AnalyticsApiClient,
} from '@contentful/optimization-api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContentfulExperiences, type Config } from './contentful-experiences.js';
import { clearIdentityCookies, seedConsent } from './test-fixtures/consent.js';
import { deferred } from './test-fixtures/dom.js';

const runtimes = new Set<ContentfulExperiences>();
const resolveOptions = { config: { components: {} } };

function createRuntime(config: Partial<Config> = {}) {
  const runtime = new ContentfulExperiences({
    spaceId: 'space',
    environmentId: 'environment',
    delivery: { accessToken: 'delivery-token' },
    defaults: { profile: profileFixture('visitor'), consent: false },
    ...config,
  });
  runtimes.add(runtime);
  return runtime;
}

type Runtime = ReturnType<typeof createRuntime>;
type DestinationFetch = (
  runtime: Runtime,
  personalization?: { profileId?: string; events?: unknown[] }
) => ReturnType<Runtime['fetchByDestinationPath']>;

// Both Destination fetches share one code path with by-id, so each case runs for both.
const byNode: [string, 'fetchByDestinationNode', DestinationFetch, object] = [
  'by node id',
  'fetchByDestinationNode',
  (runtime, personalization) =>
    runtime.fetchByDestinationNode(
      { destinationId: 'dest', nodeId: 'node', personalization } as never,
      resolveOptions
    ),
  { destinationId: 'dest', nodeId: 'node' },
];
const byPath: [string, 'fetchByDestinationPath', DestinationFetch, object] = [
  'by path',
  'fetchByDestinationPath',
  (runtime, personalization) =>
    runtime.fetchByDestinationPath(
      { destinationId: 'dest', path: '/page', personalization } as never,
      resolveOptions
    ),
  { destinationId: 'dest', path: '/page' },
];

beforeEach(() => {
  seedConsent({ events: false, persistence: false });
  vi.spyOn(PersonalizationApiClient.prototype, 'upsertProfile').mockResolvedValue({
    profile: profileFixture('visitor'),
  } as never);
  vi.spyOn(AnalyticsApiClient.prototype, 'sendBatchEvents').mockResolvedValue(true);
});

afterEach(() => {
  for (const runtime of runtimes) runtime.destroy();
  runtimes.clear();
  vi.restoreAllMocks();
  window.localStorage.clear();
  clearIdentityCookies();
});

describe.each([byNode, byPath])('Web Destination fetch %s', (_label, method, fetchIt, locator) => {
  const spyOnBase = () =>
    vi.spyOn(RuntimeContentfulExperiences.prototype, method).mockResolvedValue({
      nodes: [],
    } as never);

  it('sends the stored profile id', async () => {
    const runtime = createRuntime();
    const fetch = spyOnBase();

    await fetchIt(runtime);

    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      { ...locator, personalization: { profileId: 'visitor' } },
      resolveOptions
    );
  });

  it('lets an explicit profile id win over the stored one', async () => {
    const runtime = createRuntime();
    const fetch = spyOnBase();

    await fetchIt(runtime, { profileId: 'explicit' });

    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      { ...locator, personalization: { profileId: 'explicit' } },
      resolveOptions
    );
  });

  it('stores the complete profile XDA returns', async () => {
    const runtime = createRuntime();
    vi.spyOn(RuntimeContentfulExperiences.prototype, method).mockResolvedValue({
      nodes: [],
      personalization: { profile: profileFixture('returned') },
    } as never);

    await fetchIt(runtime);

    expect(runtime.states.profile.current).toEqual(profileFixture('returned'));
  });

  it('returns a redirect unchanged and leaves the profile alone', async () => {
    const runtime = createRuntime();
    vi.spyOn(RuntimeContentfulExperiences.prototype, method).mockResolvedValue({
      redirect: { path: '/elsewhere' },
    } as never);

    await expect(fetchIt(runtime)).resolves.toEqual({ redirect: { path: '/elsewhere' } });
    expect(runtime.states.profile.current).toEqual(profileFixture('visitor'));
  });

  it('drops caller-built events that consent does not admit and reports them', async () => {
    const onEventBlocked = vi.fn();
    const runtime = createRuntime({ onEventBlocked });
    const fetch = spyOnBase();
    const track = runtime.eventBuilder.buildTrack({ event: 'clicked' });

    await fetchIt(runtime, { events: [track] });

    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      { ...locator, personalization: { profileId: 'visitor', events: [] } },
      resolveOptions
    );
    expect(onEventBlocked).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'consent', method: 'track' })
    );
  });

  it('rejects invalid personalization before any request', async () => {
    const runtime = createRuntime();
    const fetch = spyOnBase();

    await expect(fetchIt(runtime, { profileId: 123 as never })).rejects.toThrow(
      'Invalid Experience personalization'
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects an in-flight result after reset() without storing its profile', async () => {
    const runtime = createRuntime();
    const pending = deferred<object>();
    const fetch = vi
      .spyOn(RuntimeContentfulExperiences.prototype, method)
      .mockReturnValue(pending.promise as never);

    const request = fetchIt(runtime);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    runtime.reset();
    pending.resolve({ nodes: [], personalization: { profile: profileFixture('stale') } });
    await expect(request).rejects.toThrow('Experiences fetch was superseded');

    expect(runtime.states.profile.current).toBeUndefined();
  });

  it('rejects once the SDK has been destroyed', async () => {
    const runtime = createRuntime();
    const fetch = spyOnBase();
    runtime.destroy();

    await expect(fetchIt(runtime)).rejects.toThrow('Experiences SDK has been destroyed');
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('Web Destination request sharing and attribution', () => {
  const pathSelector = { destinationId: 'dest', path: '/same' };
  const nodeSelector = { destinationId: 'dest', nodeId: '/same' };

  it('shares concurrent equal event-free Destination requests and clones each result', async () => {
    const runtime = createRuntime();
    const pending = deferred<{ nodes: never[]; experienceId: string }>();
    const base = vi
      .spyOn(RuntimeContentfulExperiences.prototype, 'fetchByDestinationPath')
      .mockReturnValue(pending.promise as never);
    const first = runtime.fetchByDestinationPath(pathSelector, resolveOptions);
    const second = runtime.fetchByDestinationPath({ ...pathSelector }, resolveOptions);
    await vi.waitFor(() => expect(base).toHaveBeenCalledTimes(1));
    pending.resolve({ nodes: [], experienceId: 'resolved' });
    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual({ nodes: [], experienceId: 'resolved' });
    expect(b).toEqual(a);
    expect(b).not.toBe(a);
    expect(base).toHaveBeenCalledTimes(1);
  });

  it('shares redirects as values without combining Experience, path and node selectors', async () => {
    const runtime = createRuntime();
    const byPathFetch = vi
      .spyOn(RuntimeContentfulExperiences.prototype, 'fetchByDestinationPath')
      .mockResolvedValue({ redirect: { path: '/next' } });
    const byNodeFetch = vi
      .spyOn(RuntimeContentfulExperiences.prototype, 'fetchByDestinationNode')
      .mockResolvedValue({ nodes: [] } as never);
    const byIdFetch = vi
      .spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience')
      .mockResolvedValue({ nodes: [] } as never);
    const results = await Promise.all([
      runtime.fetchByDestinationPath(pathSelector, resolveOptions),
      runtime.fetchByDestinationPath(pathSelector, resolveOptions),
      runtime.fetchByDestinationNode(nodeSelector, resolveOptions),
      runtime.fetchExperience({ experienceId: '/same' }, resolveOptions),
    ]);
    expect(results[0]).toEqual({ redirect: { path: '/next' } });
    expect(results[1]).toEqual({ redirect: { path: '/next' } });
    expect(byPathFetch).toHaveBeenCalledTimes(1);
    expect(byNodeFetch).toHaveBeenCalledTimes(1);
    expect(byIdFetch).toHaveBeenCalledTimes(1);
  });

  it('never combines event-bearing Destination requests', async () => {
    seedConsent({ events: true, persistence: false });
    const runtime = createRuntime({
      defaults: { profile: profileFixture('visitor'), consent: true },
    });
    const base = vi
      .spyOn(RuntimeContentfulExperiences.prototype, 'fetchByDestinationPath')
      .mockResolvedValue({ nodes: [] } as never);
    await Promise.all([
      runtime.fetchByDestinationPath(
        { ...pathSelector, personalization: { events: [{ type: 'page' }] } },
        resolveOptions
      ),
      runtime.fetchByDestinationPath(
        { ...pathSelector, personalization: { events: [{ type: 'page' }] } },
        resolveOptions
      ),
    ]);
    expect(base).toHaveBeenCalledTimes(2);
    for (const [request] of base.mock.calls)
      expect(request.personalization?.events).toEqual([expect.objectContaining({ type: 'page' })]);
  });

  it('does not request the source-map extension, which Destinations do not accept', async () => {
    const runtime = createRuntime();
    runtime.tracking.enable('views');
    const base = vi
      .spyOn(RuntimeContentfulExperiences.prototype, 'fetchByDestinationNode')
      .mockResolvedValue({ nodes: [] } as never);
    await runtime.fetchByDestinationNode(nodeSelector, resolveOptions);
    expect(base.mock.lastCall![0]).not.toHaveProperty('extensions');
  });

  it('discards a superseded Destination result after reset', async () => {
    const runtime = createRuntime();
    const pending = deferred<{ nodes: never[] }>();
    vi.spyOn(RuntimeContentfulExperiences.prototype, 'fetchByDestinationPath').mockReturnValue(
      pending.promise as never
    );
    const load = runtime.fetchByDestinationPath(pathSelector, resolveOptions);
    await Promise.resolve();
    runtime.reset();
    pending.resolve({ nodes: [] });
    await expect(load).rejects.toThrow(/superseded/);
  });
});
