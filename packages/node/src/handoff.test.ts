import { profileFixture } from './test/profile.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DestinationRedirectResult } from '@contentful/experiences-client';
import type { ExperiencePayload } from '@contentful/experiences-sdk-core';
import type {
  BuiltFetchExperienceOptions,
  OptimizationEventStreamEvent,
  FetchExperienceOptions,
  FetchResolveOptions,
  PreviewSessionOptions,
} from '@contentful/experiences-runtime';
import { ContentfulExperiences, type Config } from './contentful-experiences.js';

// Expose the actual Runtime payload boundary for a no-network spy.
class TestRuntime extends ContentfulExperiences {
  override fetchPreviewSessionPayload(session: PreviewSessionOptions): Promise<ExperiencePayload> {
    return super.fetchPreviewSessionPayload(session);
  }

  override fetchExperiencePayload(
    options: BuiltFetchExperienceOptions,
    resolveOptions: FetchResolveOptions
  ): Promise<ExperiencePayload | DestinationRedirectResult> {
    return super.fetchExperiencePayload(options, resolveOptions);
  }
}

const resolver = { config: { components: {} } };
const route = { routeKey: '/' };
const scope = { spaceId: 'space', environmentId: 'environment' };
const runtimes: TestRuntime[] = [];
const payload = (profileId = 'xda-profile'): ExperiencePayload => ({
  sys: { type: 'Experience' },
  nodes: [],
  extensions: { personalization: { profile: profileFixture(profileId) } },
});

function setup(policy: Pick<Config, 'allowedEventTypes' | 'onEventBlocked'> = {}) {
  const sdk = new TestRuntime({
    ...scope,
    locale: 'en-US',
    delivery: { accessToken: 'token' },
    preview: { accessToken: 'preview-token' },
    ...policy,
  });
  runtimes.push(sdk);
  const fetch = vi.spyOn(sdk, 'fetchExperiencePayload').mockResolvedValue(payload());
  const commit = vi
    .spyOn(sdk.api.personalization, 'upsertProfile')
    .mockResolvedValue({ profile: profileFixture('committed-profile') } as never);
  const request = sdk.forRequest({ consent: true });
  const options = {
    experienceId: 'experience',
    personalization: { events: [request.eventBuilder.buildIdentify({ userId: 'user' })] },
  };
  return { sdk, request, options, fetch, commit };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

afterEach(() => {
  for (const sdk of runtimes.splice(0)) sdk.destroy();
  vi.restoreAllMocks();
});

describe('Node browser-handoff producer', () => {
  it('rejects committing handoff intent before building, interception or transport', async () => {
    const { sdk, fetch, commit } = setup();
    const request = sdk.forRequest({ consent: true });
    const build = vi.spyOn(sdk.eventBuilder, 'buildPageView');
    const intercept = vi.fn((event) => event);
    sdk.interceptors.event.add(intercept);
    await expect(
      request.fetchExperienceForHandoff(
        {
          experienceId: 'experience',
          personalization: { preflight: false, events: [{ type: 'page' }] },
        },
        resolver,
        route
      )
    ).rejects.toThrow(/preflight: true/);
    expect(build).not.toHaveBeenCalled();
    expect(intercept).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it.each([
    { changes: [] },
    {
      changes: [
        {
          type: 'Variable' as const,
          key: 'banner',
          value: false,
          meta: { experienceId: 'experiment', variantIndex: 0 },
        },
      ],
    },
  ])('carries returned flag snapshots through private handoffs (%j)', async ({ changes }) => {
    const { request, options, fetch } = setup();
    const response = payload();
    response.extensions!.personalization!.changes = changes;
    fetch.mockResolvedValueOnce(response);
    const { handoff } = await request.fetchExperienceForHandoff(options, resolver, route);
    expect(handoff.state).toEqual({ profile: profileFixture('xda-profile'), changes });
  });

  it.each(['home', '', undefined, null])(
    'rejects invalid route descriptors (%s) before XDA',
    async (routeKey) => {
      const { request, options, fetch, commit } = setup();
      await expect(
        request.fetchExperienceForHandoff(options, resolver, { routeKey } as never)
      ).rejects.toThrow(/route key/);
      expect(fetch).not.toHaveBeenCalled();
      expect(commit).not.toHaveBeenCalled();
    }
  );

  it('evaluates consumer events at XDA and returns their exact finalized aggregate without committing', async () => {
    const { sdk, fetch, commit } = setup();
    const request = sdk.forRequest({
      consent: true,
      preflight: false,
      profile: { id: 'incoming' },
      locale: 'de-DE',
      eventContext: { userAgent: 'request-agent' },
      personalizationOptions: { ip: '203.0.113.7', plainText: true, locale: 'fr-FR' },
    });
    const hook = vi.fn((event: OptimizationEventStreamEvent) => {
      expect(event.context).toMatchObject({
        locale: 'de-DE',
        userAgent: 'request-agent',
        gdpr: { isConsentGiven: true },
      });
      event.context.userAgent = 'intercepted';
      return event;
    });
    sdk.interceptors.event.add(hook);
    const events = [
      { type: 'identify', userId: 'user' },
      { type: 'track', event: 'opened' },
      { type: 'page', properties: { url: 'https://example.test/home' } },
    ] satisfies NonNullable<FetchExperienceOptions['personalization']>['events'];
    const original = globalThis.structuredClone(events);
    const builders = [
      vi.spyOn(sdk.eventBuilder, 'buildIdentify'),
      vi.spyOn(sdk.eventBuilder, 'buildTrack'),
      vi.spyOn(sdk.eventBuilder, 'buildPageView'),
    ];
    const { handoff, error, plan } = await request.fetchExperienceForHandoff(
      { experienceId: 'experience', personalization: { events } },
      resolver,
      { routeKey: '/home?sort=popular' }
    );
    expect(error).toBeUndefined();
    expect(plan).toBeDefined();
    expect(commit).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]![0].personalization?.preflight).toBe(true);
    const evaluated = globalThis.structuredClone(fetch.mock.calls[0]![0].personalization?.events);
    expect(handoff.replay?.events).toEqual(evaluated);
    expect(evaluated).toMatchObject(
      events.map((event) => ({
        ...event,
        messageId: expect.any(String),
        context: { locale: 'de-DE', userAgent: 'intercepted', gdpr: { isConsentGiven: true } },
      }))
    );
    expect(events).toEqual(original);
    expect(fetch.mock.calls[0]![0].personalization?.profileId).toBe('incoming');
    expect(handoff).toMatchObject({
      ...scope,
      cache: { scope: 'private-request' },
      profileId: 'xda-profile',
      state: { profile: profileFixture('xda-profile') },
      replay: { routeKey: '/home?sort=popular', locale: 'de-DE' },
    });
    expect(request.profile?.id).toBe('xda-profile');
    for (const builder of builders) expect(builder).toHaveBeenCalledOnce();
    expect(hook).toHaveBeenCalledTimes(events.length);
    expect(commit).not.toHaveBeenCalled();
  });

  it.each([
    { stage: 'fetch', selector: { experienceId: 'experience' } },
    { stage: 'resolve', selector: { experienceId: 'experience' } },
    { stage: 'resolve', selector: { destinationId: 'dest', path: '/page' } },
    { stage: 'resolve', selector: { destinationId: 'dest', nodeId: 'node' } },
  ] as const)(
    'retains a usable browser replay after $stage failure ($selector)',
    async ({ stage, selector }) => {
      const { sdk, options, fetch, commit } = setup();
      const failure = new Error('content failed');
      if (stage === 'fetch') fetch.mockRejectedValueOnce(failure);
      else vi.spyOn(sdk, 'resolveExperience').mockRejectedValueOnce(failure);
      const request = sdk.forRequest({ consent: true, profile: { id: 'incoming' } });
      const events = options.personalization.events;
      const { handoff, error, plan } = await request.fetchExperienceForHandoff(
        { ...selector, locale: 'de-DE', personalization: options.personalization },
        resolver,
        route
      );
      expect(error).toBe(failure);
      expect(plan).toBeUndefined();
      expect(handoff.replay?.events).toEqual(events);
      expect(handoff.profileId).toBe(stage === 'fetch' ? 'incoming' : 'xda-profile');
      expect(handoff.state).toEqual(
        stage === 'fetch' ? undefined : { profile: profileFixture('xda-profile') }
      );
      expect(handoff.replay?.locale).toBe('de-DE');
      expect(fetch).toHaveBeenCalledOnce();
      expect(fetch.mock.calls[0]?.[0]).toMatchObject({
        ...selector,
        locale: 'de-DE',
        personalization: { preflight: true },
      });
      expect(commit).not.toHaveBeenCalled();
    }
  );

  it('finishes asynchronous identify interception before starting track interception', async () => {
    const { sdk, request, fetch, commit } = setup();
    const hold = deferred<void>();
    let identified = false;
    const hook = vi.fn(async (event: OptimizationEventStreamEvent) => {
      if (event.type === 'identify') {
        await hold.promise;
        identified = true;
      } else {
        expect(identified).toBe(true);
      }
      return event;
    });
    sdk.interceptors.event.add(hook);
    const pending = request.fetchExperienceForHandoff(
      {
        experienceId: 'experience',
        personalization: {
          events: [
            { type: 'identify', userId: 'user' },
            { type: 'track', event: 'opened' },
          ],
        },
      },
      resolver,
      route
    );
    expect(hook).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
    hold.resolve();
    const { handoff, plan, error } = await pending;
    expect(hook.mock.calls.map(([event]) => event.type)).toEqual(['identify', 'track']);
    expect(handoff.replay?.events).toEqual(fetch.mock.calls[0]![0].personalization?.events);
    expect(plan).toBeDefined();
    expect(error).toBeUndefined();
    expect(fetch).toHaveBeenCalledOnce();
    expect(commit).not.toHaveBeenCalled();
  });

  it('stops remaining interception and XDA when destroyed during an asynchronous identify hook', async () => {
    const { sdk, request, fetch, commit } = setup();
    const hold = deferred<void>();
    const hook = vi.fn(async (event: OptimizationEventStreamEvent) => {
      await hold.promise;
      return event;
    });
    sdk.interceptors.event.add(hook);
    const pending = request.fetchExperienceForHandoff(
      {
        experienceId: 'experience',
        personalization: {
          events: [
            { type: 'identify', userId: 'user' },
            { type: 'track', event: 'opened' },
          ],
        },
      },
      resolver,
      route
    );
    request.destroy();
    hold.resolve();
    await expect(pending).rejects.toThrow(/destroyed/);
    expect(hook).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it('passes a valid raw query-array body unchanged to XDA and returns content without committing', async () => {
    const { request, fetch, commit } = setup();
    const page = request.eventBuilder.buildPageView({
      properties: { url: 'https://example.test/?tag=one&tag=two' },
    });
    const raw = {
      ...page,
      context: { ...page.context, page: { ...page.context.page, query: { tag: ['one', 'two'] } } },
    };
    const original = globalThis.structuredClone(raw);
    const { handoff, plan, error } = await request.fetchExperienceForHandoff(
      { experienceId: 'experience', personalization: { events: [raw] } },
      resolver,
      route
    );
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]![0].personalization?.events).toEqual([original]);
    expect(handoff.replay?.events).toEqual([original]);
    expect(raw).toEqual(original);
    expect(plan?.personalization?.profile?.id).toBe('xda-profile');
    expect(request.profile?.id).toBe('xda-profile');
    expect(error).toBeUndefined();
    expect(commit).not.toHaveBeenCalled();
  });

  it('rejects invalid finalized XDA hook output before XDA', async () => {
    const { sdk, request, options, fetch, commit } = setup();
    const hook = vi.fn((event: OptimizationEventStreamEvent) => {
      Object.assign(event.context, { gdpr: { isConsentGiven: 'yes' } });
      return event;
    });
    sdk.interceptors.event.add(hook);
    await expect(request.fetchExperienceForHandoff(options, resolver, route)).rejects.toThrow(
      /Invalid Experience personalization options/
    );
    expect(hook).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it('filters consent-blocked events before interception and preserves admitted replay', async () => {
    const onEventBlocked = vi.fn();
    const { sdk, options, fetch, commit } = setup({ onEventBlocked });
    const denied = sdk.forRequest({ consent: false, profile: { id: 'denied' } });
    const events = [
      ...options.personalization.events,
      sdk.eventBuilder.buildTrack({ event: 'opened' }),
    ];
    const hook = vi.fn((event: OptimizationEventStreamEvent) => event);
    sdk.interceptors.event.add(hook);
    const { handoff: filtered } = await denied.fetchExperienceForHandoff(
      { ...options, personalization: { events } },
      resolver,
      route
    );
    expect(filtered.replay?.events.map((event) => event.type)).toEqual(['identify']);
    expect(filtered.replay?.events[0]).toMatchObject({
      context: { gdpr: { isConsentGiven: false } },
    });
    expect(hook).toHaveBeenCalledOnce();
    expect(onEventBlocked).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'consent', method: 'track' })
    );

    expect(fetch.mock.calls[0]![0].personalization?.events).toEqual(filtered.replay?.events);
    expect(commit).not.toHaveBeenCalled();
  });

  it.each([undefined, 'experience'])(
    'isolates preview personalization and identity with snapshot ID %s',
    async (experienceId) => {
      const { sdk, options, fetch, commit } = setup();
      vi.spyOn(sdk, 'fetchPreviewSessionPayload').mockResolvedValue({
        ...payload('preview-profile'),
        sys: { type: 'Experience', id: experienceId },
      });
      const request = sdk.forRequest({
        preview: { sessionId: 'session' },
        consent: true,
        profile: { id: 'preview-owner' },
      });
      const result = await request.fetchExperienceForHandoff(options, resolver, route);
      expect(result.handoff).toEqual({ ...scope, cache: { scope: 'private-request' } });
      expect(result.plan?.personalization?.profile.id).toBe(
        experienceId ? 'preview-profile' : 'xda-profile'
      );
      expect(result.error).toBeUndefined();
      expect(request.profile).toBeUndefined();
      expect(request.canPersistProfile).toBe(false);
      if (experienceId) expect(fetch).not.toHaveBeenCalled();
      else expect(fetch.mock.calls[0]![0].personalization).toBeUndefined();
      expect(commit).not.toHaveBeenCalled();
    }
  );

  it.each(['snapshot', 'delivery', 'resolution'] as const)(
    'returns preview %s failures in an identity-free handoff',
    async (source) => {
      const { sdk, options, fetch, commit } = setup();
      const failure = new TypeError(`${source} content failed`);
      const snapshot = { ...payload(), sys: { type: 'Experience' as const, id: 'experience' } };
      const read = vi.spyOn(sdk, 'fetchPreviewSessionPayload').mockResolvedValue(snapshot);
      const resolve = vi.spyOn(sdk, 'resolveExperience');
      if (source === 'snapshot') read.mockRejectedValueOnce(failure);
      if (source === 'delivery') {
        snapshot.sys.id = 'other';
        fetch.mockRejectedValueOnce(failure);
      }
      if (source === 'resolution') resolve.mockRejectedValueOnce(failure);
      const request = sdk.forRequest({
        preview: { sessionId: 'session' },
        consent: true,
        profile: { id: 'visitor' },
      });
      await expect(request.fetchExperienceForHandoff(options, resolver, route)).resolves.toEqual({
        handoff: { ...scope, cache: { scope: 'private-request' } },
        error: failure,
      });
      expect(request.isPreview).toBe(true);
      expect(request.profile).toBeUndefined();
      expect(request.canPersistProfile).toBe(false);
      expect(commit).not.toHaveBeenCalled();
      if (source !== 'delivery') expect(fetch).not.toHaveBeenCalled();
    }
  );

  it('keeps matching preview override validation outside handoff content errors', async () => {
    const { sdk, options, fetch, commit } = setup();
    vi.spyOn(sdk, 'fetchPreviewSessionPayload').mockResolvedValue({
      ...payload(),
      sys: { type: 'Experience', id: 'experience' },
    });
    const resolve = vi.spyOn(sdk, 'resolveExperience');
    const request = sdk.forRequest({ preview: { sessionId: 'session' } });
    await expect(
      request.fetchExperienceForHandoff({ ...options, locale: 'de-DE' }, resolver, route)
    ).rejects.toThrow(/locale is server-owned/);
    expect(resolve).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it.each(['snapshot', 'resolution'] as const)(
    'rejects preview handoff disposal during %s instead of returning a content error',
    async (source) => {
      const { sdk, options, fetch, commit } = setup();
      const snapshot = { ...payload(), sys: { type: 'Experience' as const, id: 'experience' } };
      const read = vi.spyOn(sdk, 'fetchPreviewSessionPayload').mockResolvedValue(snapshot);
      const resolve = vi.spyOn(sdk, 'resolveExperience');
      const hold = deferred<ExperiencePayload>();
      if (source === 'snapshot') read.mockReturnValueOnce(hold.promise);
      else
        resolve.mockImplementationOnce(async () => {
          await hold.promise;
          throw new Error('late resolution failure');
        });
      const request = sdk.forRequest({ preview: { sessionId: 'session' } });
      const pending = request.fetchExperienceForHandoff(options, resolver, route);
      if (source === 'resolution') await vi.waitFor(() => expect(resolve).toHaveBeenCalled());
      request.destroy();
      hold.resolve(snapshot);
      await expect(pending).rejects.toThrow(/destroyed/);
      expect(fetch).not.toHaveBeenCalled();
      expect(commit).not.toHaveBeenCalled();
    }
  );

  it('returns a private aggregate without synthesizing event intent', async () => {
    const { request, fetch, commit } = setup();
    const { handoff } = await request.fetchExperienceForHandoff(
      { experienceId: 'experience' },
      resolver,
      route
    );
    expect(handoff).toEqual({
      ...scope,
      cache: { scope: 'private-request' },
      profileId: 'xda-profile',
      state: { profile: profileFixture('xda-profile') },
    });
    expect(fetch.mock.calls[0]![0].personalization).toBeUndefined();
    expect(commit).not.toHaveBeenCalled();
  });

  it.each(['ordinary', 'handoff'] as const)(
    'discards late %s content after destruction without touching another request',
    async (operation) => {
      const { sdk, options, fetch, commit } = setup();
      const owner = sdk.forRequest({ consent: true, profile: { id: 'owner' } });
      const other = sdk.forRequest({ consent: true, profile: { id: 'other' } });
      const hold = deferred<ExperiencePayload>();
      fetch.mockReturnValueOnce(hold.promise);
      const pending =
        operation === 'ordinary'
          ? owner.fetchExperience(options, resolver)
          : owner.fetchExperienceForHandoff(options, resolver, route);
      owner.destroy();
      hold.resolve(payload('late'));
      await expect(pending).rejects.toThrow(/destroyed/);
      expect(owner.profile?.id).toBe('owner');
      expect(other.profile?.id).toBe('other');
      expect(commit).not.toHaveBeenCalled();
    }
  );
});

describe('Node ordinary XDA fetch', () => {
  it('builds native arguments once, preserves raw intent and never commits through Personalization API', async () => {
    const { sdk, fetch, commit } = setup();
    const request = sdk.forRequest({ consent: true, profile: { id: 'incoming' } });
    const raw = sdk.eventBuilder.buildTrack({ event: 'raw' });
    const events = [
      { type: 'identify', userId: 'user' },
      { type: 'track', event: 'native' },
      { type: 'page', properties: { url: 'https://example.test/home' } },
      raw,
    ] satisfies NonNullable<FetchExperienceOptions['personalization']>['events'];
    const original = globalThis.structuredClone(events);
    const builders = [
      vi.spyOn(sdk.eventBuilder, 'buildIdentify'),
      vi.spyOn(sdk.eventBuilder, 'buildTrack'),
      vi.spyOn(sdk.eventBuilder, 'buildPageView'),
    ];
    const hook = vi.fn((event: OptimizationEventStreamEvent) => event);
    sdk.interceptors.event.add(hook);
    const plan = await request.fetchExperience(
      { experienceId: 'experience', personalization: { events } },
      resolver
    );
    for (const builder of builders) expect(builder).toHaveBeenCalledOnce();
    expect(hook).toHaveBeenCalledTimes(events.length);
    expect(fetch).toHaveBeenCalledOnce();
    const sent = fetch.mock.calls[0]![0].personalization;
    expect(sent?.profileId).toBe('incoming');
    expect(sent?.events?.map((event) => event.type)).toEqual([
      'identify',
      'track',
      'page',
      'track',
    ]);
    expect(sent?.events?.[3]).toEqual({
      ...raw,
      context: { ...raw.context, gdpr: { ...raw.context.gdpr, isConsentGiven: true } },
    });
    expect(events).toEqual(original);
    expect(plan.personalization?.profile?.id).toBe('xda-profile');
    expect(request.profile?.id).toBe('xda-profile');
    expect(commit).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'drops native event intent before building under preview=%s',
    async (isPreview) => {
      const onEventBlocked = vi.fn();
      const { sdk, fetch, commit } = setup({ onEventBlocked });
      vi.spyOn(sdk, 'fetchPreviewSessionPayload').mockResolvedValue(payload());
      const build = vi.spyOn(sdk.eventBuilder, 'buildTrack');
      const hook = vi.fn((event: OptimizationEventStreamEvent) => event);
      sdk.interceptors.event.add(hook);
      const request = sdk.forRequest({
        preview: isPreview ? { sessionId: 'session' } : undefined,
        consent: false,
        profile: { id: 'incoming' },
      });
      await request.fetchExperience(
        {
          experienceId: 'experience',
          personalization: { events: [{ type: 'track', event: 'blocked' }] },
        },
        resolver
      );
      expect(fetch.mock.calls[0]![0].personalization).toEqual(
        isPreview ? undefined : { profileId: 'incoming', events: [] }
      );
      expect(onEventBlocked).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'track', reason: isPreview ? 'preview' : 'consent' })
      );
      expect(build).not.toHaveBeenCalled();
      expect(hook).not.toHaveBeenCalled();
      expect(commit).not.toHaveBeenCalled();
      expect(request.profile?.id).toBe(isPreview ? undefined : 'xda-profile');
    }
  );

  it('propagates content failure without a fallback commit', async () => {
    const { request, options, fetch, commit } = setup();
    const failure = new Error('content failed');
    fetch.mockRejectedValueOnce(failure);
    await expect(request.fetchExperience(options, resolver)).rejects.toBe(failure);
    expect(request.profile).toBeUndefined();
    expect(commit).not.toHaveBeenCalled();
  });
});

describe('destination handoff selection', () => {
  it('returns terminal redirects alongside explicit replay intent without resolution', async () => {
    const { sdk, request, fetch } = setup();
    fetch.mockResolvedValueOnce({ redirect: { path: '/target' } });
    const resolve = vi.spyOn(sdk, 'resolveExperience');
    const result = await request.fetchExperienceForHandoff(
      { destinationId: 'dest', path: '/old', personalization: { events: [{ type: 'page' }] } },
      resolver,
      route
    );
    expect(result.redirect).toEqual({ path: '/target' });
    expect(result.handoff.replay?.events).toHaveLength(1);
    expect(result.plan).toBeUndefined();
    expect(resolve).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([
    ['master', 'selected', 'preview'],
    ['master', 'other', 'delivery'],
    ['branch', 'selected', 'delivery'],
  ])(
    'uses only same-scope, actual-ID preview content (%s, %s)',
    async (environmentId, previewId, expected) => {
      const sdk = new TestRuntime({
        spaceId: 'space',
        environmentId,
        delivery: { accessToken: 'token' },
        preview: { accessToken: 'preview' },
      });
      runtimes.push(sdk);
      const fetch = vi.spyOn(sdk, 'fetchExperiencePayload').mockResolvedValue({
        sys: { id: 'selected' },
        nodes: [],
        errors: [{ message: 'delivery' }],
      });
      const preview = vi
        .spyOn(sdk, 'fetchPreviewSessionPayload')
        .mockResolvedValue({ sys: { id: previewId }, nodes: [], errors: [{ message: 'preview' }] });
      const resolve = vi.spyOn(sdk, 'resolveExperience');
      const request = sdk.forRequest({ preview: { sessionId: 'session' }, consent: true });
      await request.fetchExperience(
        { destinationId: 'dest', path: '/', personalization: { events: [{ type: 'page' }] } },
        resolver
      );
      expect(fetch).toHaveBeenCalledOnce();
      expect(fetch.mock.calls[0]?.[0].personalization).toBeUndefined();
      expect(resolve).toHaveBeenCalledOnce();
      expect(resolve.mock.calls[0]?.[0]).toMatchObject({ errors: [{ message: expected }] });
      if (environmentId !== 'master') expect(preview).not.toHaveBeenCalled();
    }
  );
});
