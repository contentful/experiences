import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ContentfulExperiences as Runtime,
  type Config as RuntimeConfig,
  type AnalyticsDelivery,
  type PersonalizationDelivery,
  type PreviewSessionOptions,
} from '@contentful/experiences-runtime';
import type { PortableRenderPlan, ExperiencePayload } from '@contentful/experiences-sdk-core';
import type { ConfigDefaults } from '../sdk/types.js';
import type { PreviewState } from '../state/states.js';
import { WebContentRuntime } from './web-content-runtime.js';
import {
  consent as consentSignal,
  profile as profileSignal,
  changes as changesSignal,
  type Subscription,
} from '../signals/index.js';
import { completeProfile } from '../test/fixtures/profile.js';
import { deferred } from '../test/dom.js';
import { clearIdentityCookies } from '../test/consent.js';

const resolve = { config: { components: {} } };
const plan: PortableRenderPlan = { nodes: [], metadata: {}, debug: false, diagnostics: [] };
const owners: ContentRuntime[] = [];
const subscriptions: Subscription[] = [];
class ContentRuntime extends WebContentRuntime<RuntimeConfig> {
  declare protected readonly personalizationQueue: PersonalizationDelivery;
  declare protected readonly analyticsQueue: AnalyticsDelivery;
  protected readonly allowedEventTypes = ['identify', 'page'] as const;
  protected readonly onEventBlocked = vi.fn();
  protected readonly previewOptions: PreviewSessionOptions | undefined;
  constructor(
    options: {
      defaults?: ConfigDefaults;
      preview?: RuntimeConfig['preview'];
      sessionId?: string;
      locale?: string;
      environmentId?: string;
    } = {}
  ) {
    super({
      spaceId: 'space',
      environmentId: options.environmentId ?? 'environment',
      locale: options.locale,
      delivery: { accessToken: 'delivery' },
      preview: options.preview,
      eventBuilder: { channel: 'web', library: { name: 'test', version: '1' } },
    });
    this.previewOptions =
      options.preview && options.sessionId ? { sessionId: options.sessionId } : undefined;
    this.getAnonymousIdProvider = () => undefined;
    this.initializeBrowserState(options.defaults, options.locale);
    this.eventBuilder.getConsent = () => consentSignal.value;
    this.effects.push(this.installStateRevisionEffect());
    owners.push(this);
  }
  get isPreview() {
    return this.previewOptions !== undefined;
  }
  readonly trackingPolicy = { hasAutoTracking: vi.fn(() => false) };
  protected ensureInteractionTracking() {
    return this.trackingPolicy;
  }
  protected override awaitCurrentHandoffIdentity() {
    return undefined;
  }
  protected syncInteractionConsent() {}
  reset() {
    this.contentLifetime += 1;
    this.resetToken = {};
    this.content.clear();
    this.previewSnapshot = undefined;
  }
  source(state: PreviewState | undefined) {
    this.previewState.value = state;
  }
  stop() {
    this.destroyed = true;
    for (const dispose of this.effects.splice(0)) dispose();
    super.destroy();
  }
  readyPage(routeKey: string, emit: () => Promise<{ accepted: boolean }>) {
    return this.currentPage.emitIfNeeded(routeKey, emit);
  }
  blocked() {
    return this.onEventBlocked;
  }
}
function preview(
  fetch = vi.fn(
    async () =>
      new globalThis.Response(
        JSON.stringify({ sys: { type: 'Experience', id: 'hero' }, nodes: [] })
      )
  )
) {
  return {
    fetch,
    options: { preview: { accessToken: 'preview', fetch, maxRetries: 0 }, sessionId: 'session' },
  };
}
afterEach(() => {
  for (const subscription of subscriptions.splice(0)) subscription.unsubscribe();
  for (const owner of owners.splice(0)) owner.stop();
  vi.restoreAllMocks();
  window.localStorage.clear();
  clearIdentityCookies();
});

describe('WebContentRuntime ordinary evaluation', () => {
  it.each([
    { experienceId: 'experience' },
    { destinationId: 'dest', nodeId: 'node' },
    { destinationId: 'dest', path: '/page' },
  ])(
    'forwards %j with request-local options, profile and explicit preflight intent',
    async (selector) => {
      const sdk = new ContentRuntime({
        defaults: { profile: completeProfile('visitor'), consent: true },
        locale: 'en-US',
      });
      const fetch = vi.spyOn(Runtime.prototype, 'fetchExperience').mockResolvedValue(plan);
      const commit = vi
        .spyOn(sdk.api.personalization, 'upsertProfile')
        .mockRejectedValue(new Error('unexpected separate commitment'));
      const build = vi.spyOn(sdk.eventBuilder, 'buildPageView');
      const hook = vi.fn((event) => event);
      sdk.interceptors.event.add(hook);
      const published = vi.fn();
      subscriptions.push(
        sdk.states.eventStream.subscribe((event) => {
          if (event) published(event);
        })
      );
      await sdk.fetchExperience({ ...selector, locale: 'de-DE' }, resolve);
      expect(fetch).toHaveBeenLastCalledWith(
        { ...selector, locale: 'de-DE', personalization: { profileId: 'visitor' } },
        resolve
      );
      await sdk.fetchExperience(
        { ...selector, personalization: { profileId: 'explicit', events: [{ type: 'page' }] } },
        resolve
      );
      expect(fetch.mock.calls[1]?.[0].personalization).toMatchObject({
        profileId: 'explicit',
        events: [{ type: 'page' }],
      });
      await sdk.fetchExperience(
        { ...selector, personalization: { profileId: 'explicit', preflight: true, events: [] } },
        resolve
      );
      expect(fetch.mock.calls[2]?.[0].personalization).toEqual({
        profileId: 'explicit',
        preflight: true,
        events: [],
      });
      await sdk.fetchExperience(selector, resolve);
      expect(fetch.mock.calls[3]?.[0].personalization?.events).toBeUndefined();
      expect(build).toHaveBeenCalledOnce();
      expect(hook).toHaveBeenCalledOnce();
      expect(published).toHaveBeenCalledExactlyOnceWith(
        fetch.mock.calls[1]?.[0].personalization?.events?.[0]
      );
      expect(commit).not.toHaveBeenCalled();
    }
  );

  it('adopts returned profile/changes, preserves omission and explicit identity, and leaves redirects terminal', async () => {
    const initialChanges = [
      {
        type: 'Variable' as const,
        key: 'banner',
        value: true,
        meta: { experienceId: 'experiment', variantIndex: 1 },
      },
    ];
    const sdk = new ContentRuntime({
      defaults: { profile: completeProfile('visitor'), consent: false, changes: initialChanges },
    });
    const unchanged = { ...plan, personalization: { profile: completeProfile('visitor') } };
    const selected = {
      ...plan,
      personalization: { profile: completeProfile('selected'), changes: [] },
    };
    const fetch = vi
      .spyOn(Runtime.prototype, 'fetchExperience')
      .mockResolvedValueOnce(unchanged)
      .mockResolvedValueOnce(selected)
      .mockResolvedValueOnce({ redirect: { path: '/next' } });
    await expect(
      sdk.fetchExperience(
        { destinationId: 'dest', path: '/', personalization: { profileId: 'explicit' } },
        resolve
      )
    ).resolves.toEqual(unchanged);
    expect(fetch.mock.calls[0]?.[0].personalization?.profileId).toBe('explicit');
    expect(changesSignal.peek()).toEqual(initialChanges);
    await expect(
      sdk.fetchExperience({ destinationId: 'dest', path: '/selected' }, resolve)
    ).resolves.toEqual(selected);
    expect(sdk.states.profile.current).toEqual(completeProfile('selected'));
    expect(changesSignal.peek()).toEqual([]);
    await expect(
      sdk.fetchExperience({ destinationId: 'dest', path: '/redirect' }, resolve)
    ).resolves.toEqual({ redirect: { path: '/next' } });
    expect(sdk.states.profile.current).toEqual(completeProfile('selected'));
    expect(changesSignal.peek()).toEqual([]);
  });

  it('dispatches both destination wrappers through the current SDK fetch method with the complete call', async () => {
    const sdk = new ContentRuntime(),
      fetch = vi.spyOn(sdk, 'fetchExperience').mockResolvedValue(plan);
    const node = { destinationId: 'dest', nodeId: 'node' },
      path = { destinationId: 'dest', path: '/page' };
    const currentPage = { routeKey: '/page', isCurrent: () => true };
    await sdk.fetchByDestinationNode(node, resolve, currentPage);
    await sdk.fetchByDestinationPath(path, resolve, currentPage);
    expect(fetch.mock.calls).toEqual([
      [node, resolve, currentPage],
      [path, resolve, currentPage],
    ]);
    expect(fetch.mock.calls[0]?.[0]).toBe(node);
    expect(fetch.mock.calls[1]?.[0]).toBe(path);
  });

  it('shares event-free selections but never shares separately built evaluation intent', async () => {
    const sdk = new ContentRuntime({ defaults: { consent: true } }),
      pending = deferred<PortableRenderPlan>();
    const fetch = vi.spyOn(Runtime.prototype, 'fetchExperience').mockReturnValue(pending.promise);
    const selector = { destinationId: 'dest', path: '/page', locale: 'de-DE' };
    const first = sdk.fetchExperience(selector, resolve),
      second = sdk.fetchByDestinationPath(selector, resolve);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    pending.resolve(plan);
    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(fetch.mock.calls[0]?.[0]).toMatchObject(selector);
    fetch.mockClear().mockResolvedValue(plan);
    const evaluated = {
      destinationId: 'dest',
      nodeId: 'node',
      personalization: { events: [{ type: 'page' as const }] },
    };
    await Promise.all([
      sdk.fetchExperience(evaluated, resolve),
      sdk.fetchExperience(evaluated, resolve),
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0]?.[0].personalization?.events?.[0]).not.toEqual(
      fetch.mock.calls[1]?.[0].personalization?.events?.[0]
    );
  });

  it('rejects stale lifetime and independent identity changes but permits its own intercepted state adoption', async () => {
    const sdk = new ContentRuntime({ defaults: { profile: completeProfile('visitor') } }),
      pending = deferred<PortableRenderPlan>();
    const fetch = vi
      .spyOn(Runtime.prototype, 'fetchExperience')
      .mockReturnValueOnce(pending.promise);
    const first = sdk.fetchExperience({ experienceId: 'old' }, resolve),
      rejected = expect(first).rejects.toThrow('identity was superseded');
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    profileSignal.value = completeProfile('replacement');
    pending.resolve(plan);
    await rejected;
    sdk.interceptors.state.add(() => ({ profile: completeProfile('intercepted') }));
    fetch.mockResolvedValue({ ...plan, personalization: { profile: completeProfile('selected') } });
    await sdk.fetchExperience({ experienceId: 'current' }, resolve);
    expect(sdk.states.profile.current?.id).toBe('intercepted');
    const later = deferred<PortableRenderPlan>();
    fetch.mockReturnValueOnce(later.promise);
    const stale = sdk.fetchExperience({ experienceId: 'stale' }, resolve),
      expired = expect(stale).rejects.toThrow('superseded');
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    sdk.reset();
    later.resolve({ ...plan, personalization: { profile: completeProfile('stale') } });
    await expired;
    expect(sdk.states.profile.current?.id).toBe('intercepted');
    sdk.stop();
    await expect(sdk.fetchExperience({ experienceId: 'destroyed' }, resolve)).rejects.toThrow(
      'destroyed'
    );
  });

  it('publishes embedded events before Delivery, isolates subscriber errors and refuses partial invalid batches', async () => {
    const sdk = new ContentRuntime(),
      error = new Error('diagnostic subscriber failed');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const events = vi.fn((event) => {
      if (event) throw error;
    });
    const subscription = sdk.states.eventStream.subscribe(events);
    subscriptions.push(subscription);
    const fetch = vi.spyOn(Runtime.prototype, 'fetchExperience').mockImplementation(async () => {
      expect(events).toHaveBeenCalledTimes(2);
      return plan;
    });
    const page = sdk.eventBuilder.buildPageView();
    await sdk.fetchExperience(
      { experienceId: 'embedded', personalization: { events: [page] } },
      resolve
    );
    expect(events.mock.calls[1]?.[0].messageId).toBe(page.messageId);
    expect(warn).toHaveBeenCalledWith('Event stream subscriber failed', error);
    events.mockClear();
    const malformed = {
      experienceId: 'invalid',
      personalization: { events: [page, { ...page, timestamp: 123 }] },
    };
    await expect(sdk.fetchExperience(malformed, resolve)).rejects.toThrow(
      'Invalid Experience personalization'
    );
    expect(events).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
    subscription.unsubscribe();
  });

  it('stops the remaining publication and transport when its first event observer expires the operation', async () => {
    const sdk = new ContentRuntime({ defaults: { consent: true } }),
      events = vi.fn();
    const first = sdk.states.eventStream.subscribe(events);
    const invalidate = sdk.states.eventStream.subscribe((event) => {
      if (event) {
        invalidate.unsubscribe();
        sdk.reset();
      }
    });
    subscriptions.push(first, invalidate);
    const fetch = vi.spyOn(Runtime.prototype, 'fetchExperience').mockResolvedValue(plan);
    await expect(
      sdk.fetchExperience(
        {
          experienceId: 'expired',
          personalization: {
            events: [
              sdk.eventBuilder.buildTrack({ event: 'first' }),
              sdk.eventBuilder.buildPageView(),
            ],
          },
        },
        resolve
      )
    ).rejects.toThrow('superseded');
    expect(
      events.mock.calls.filter(([event]) => event !== undefined).map(([event]) => event.type)
    ).toEqual(['track']);
    expect(fetch).not.toHaveBeenCalled();
    first.unsubscribe();
    invalidate.unsubscribe();
  });

  it.each([
    ['ordinary', false],
    ['ordinary', true],
    ['preview', false],
    ['preview', true],
  ] as const)(
    'retains content but rejects stale %s state (pending interception: %s)',
    async (source, interception) => {
      const configuration =
        source === 'preview'
          ? preview(
              vi.fn(
                async () =>
                  new globalThis.Response(
                    JSON.stringify({ sys: { type: 'Experience', id: 'other' }, nodes: [] })
                  )
              )
            ).options
          : {};
      const sdk = new ContentRuntime({
        ...configuration,
        defaults: { profile: completeProfile('visitor') },
      });
      const stale = deferred<PortableRenderPlan>(),
        gate = deferred<void>(),
        intercepted = deferred<void>();
      const staleData = { profile: completeProfile('visitor'), changes: [] };
      if (interception)
        sdk.interceptors.state.add(async (state) => {
          if (state.changes?.length === 0) {
            intercepted.resolve();
            await gate.promise;
          }
          return state;
        });
      const fetch = vi
        .spyOn(Runtime.prototype, 'fetchExperience')
        .mockReturnValueOnce(stale.promise);
      const load = (version: string) =>
        sdk.fetchExperience({ experienceId: 'experience', parameters: { version } }, resolve);
      const pending = load('stale');
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
      if (interception) {
        stale.resolve({ ...plan, personalization: staleData });
        await intercepted.promise;
      }
      const fresh = [
        {
          type: 'Variable' as const,
          key: 'banner',
          value: 'fresh',
          meta: { experienceId: 'experiment', variantIndex: 1 },
        },
      ];
      fetch.mockResolvedValue({
        ...plan,
        personalization: { profile: completeProfile('visitor'), changes: fresh },
      });
      await load('fresh');
      if (!interception) stale.resolve({ ...plan, personalization: staleData });
      gate.resolve();
      await expect(pending).resolves.toMatchObject({ personalization: staleData });
      expect(changesSignal.peek()).toEqual(fresh);
      expect(sdk.states.profile.current).toEqual(completeProfile('visitor'));
    }
  );

  it.each(['caller', 'reset', 'destroy', 'blocked callback'] as const)(
    'rejects pending preparation after %s invalidation before publication/transport',
    async (action) => {
      const sdk = new ContentRuntime({ defaults: { consent: false } }),
        gate = deferred<void>();
      let current = true;
      sdk.interceptors.event.add(async (event) => {
        await gate.promise;
        // This page-to-track rewrite is intentionally malformed for a page-shaped event; runtime validation is the assertion under test.
        return { ...event, type: 'track', event: 'changed' } as unknown as Parameters<
          typeof sdk.interceptors.event.run
        >[0];
      });
      if (action === 'blocked callback') sdk.blocked().mockImplementation(() => sdk.reset());
      const fetch = vi.spyOn(Runtime.prototype, 'fetchExperience').mockResolvedValue(plan);
      const pending = sdk.fetchExperience(
        { experienceId: 'stale', personalization: { events: [sdk.eventBuilder.buildPageView()] } },
        resolve,
        { routeKey: '/old', isCurrent: () => current }
      );
      const rejected = expect(pending).rejects.toThrow(
        action === 'destroy' ? 'destroyed' : 'superseded'
      );
      if (action === 'caller') current = false;
      if (action === 'reset') sdk.reset();
      if (action === 'destroy') sdk.stop();
      gate.resolve();
      await rejected;
      expect(sdk.states.eventStream.current).toBeUndefined();
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it('releases current-page retry after final admission without waiting for content HTTP', async () => {
    const sdk = new ContentRuntime({ defaults: { consent: false } }),
      gate = deferred<void>(),
      response = deferred<PortableRenderPlan>();
    sdk.interceptors.event.add(async (event) => {
      await gate.promise;
      // The interceptor deliberately changes the event kind; final runtime validation/admission is tested below.
      return { ...event, type: 'track', event: 'rewritten' } as unknown as Parameters<
        typeof sdk.interceptors.event.run
      >[0];
    });
    const fetch = vi.spyOn(Runtime.prototype, 'fetchExperience').mockReturnValue(response.promise);
    const pending = sdk.fetchExperience(
      {
        experienceId: 'exp',
        personalization: {
          profileId: 'caller-profile',
          events: [sdk.eventBuilder.buildPageView()],
        },
      },
      resolve,
      { routeKey: '/current' }
    );
    const emit = vi.fn(async () => ({ accepted: true }));
    const retry = sdk.readyPage('/current', emit);
    expect(emit).not.toHaveBeenCalled();
    gate.resolve();
    await expect(retry).resolves.toEqual({ accepted: true });
    expect(emit).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]?.[0].personalization).toEqual({
      profileId: 'caller-profile',
      events: [],
    });
    expect(sdk.blocked()).toHaveBeenCalledWith(expect.objectContaining({ method: 'track' }));
    expect(sdk.states.eventStream.current).toBeUndefined();
    response.resolve(plan);
    await pending;
  });

  it('rejects invalid selectors and personalization before transport while reporting only consent-blocked intent', async () => {
    const sdk = new ContentRuntime({
        defaults: { consent: false, profile: completeProfile('visitor') },
      }),
      fetch = vi.spyOn(Runtime.prototype, 'fetchExperience').mockResolvedValue(plan);
    await expect(
      sdk.fetchExperience({ destinationId: 'dest', path: 'relative' }, resolve)
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    const malformed = { experienceId: 'id', personalization: { profileId: 42 } };
    // @ts-expect-error Exercise runtime rejection of malformed caller input.
    await expect(sdk.fetchExperience(malformed, resolve)).rejects.toThrow(
      'Invalid Experience personalization'
    );
    expect(fetch).not.toHaveBeenCalled();
    await sdk.fetchExperience(
      { experienceId: 'id', personalization: { events: [{ type: 'track', event: 'blocked' }] } },
      resolve
    );
    expect(sdk.blocked()).toHaveBeenCalledWith(expect.objectContaining({ method: 'track' }));
    expect(fetch.mock.calls[0]?.[0].personalization).toEqual({
      events: [],
      profileId: 'visitor',
    });
  });
});

describe('WebContentRuntime Preview sources', () => {
  it('shares acquisition failure without Delivery fallback and retries snapshots afterward', async () => {
    const f = preview(),
      hold = deferred<globalThis.Response>();
    f.fetch.mockReturnValueOnce(hold.promise);
    const sdk = new ContentRuntime(f.options),
      ordinary = vi.spyOn(Runtime.prototype, 'fetchExperience').mockResolvedValue(plan);
    const pending = Promise.allSettled([
      sdk.fetchExperience({ experienceId: 'hero' }, resolve),
      sdk.fetchExperience({ experienceId: 'other' }, resolve),
    ]);
    await vi.waitFor(() => expect(f.fetch).toHaveBeenCalledOnce());
    expect(ordinary).not.toHaveBeenCalled();
    hold.resolve(new globalThis.Response('', { status: 500 }));
    expect(await pending).toEqual([
      { status: 'rejected', reason: expect.objectContaining({ name: 'PreviewSessionFetchError' }) },
      { status: 'rejected', reason: expect.objectContaining({ name: 'PreviewSessionFetchError' }) },
    ]);
    expect(ordinary).not.toHaveBeenCalled();
    expect(sdk.states.profile.current).toBeUndefined();
    await sdk.fetchExperience({ experienceId: 'hero' }, resolve);
    await sdk.fetchExperience({ experienceId: 'other' }, resolve);
    expect(f.fetch).toHaveBeenCalledTimes(3);
    expect(ordinary).toHaveBeenCalledOnce();
  });

  it('uses reported payload identity and validates overrides only for matching snapshot content', async () => {
    const f = preview();
    f.fetch.mockResolvedValueOnce(
      new globalThis.Response(JSON.stringify({ sys: { type: 'Experience' }, nodes: [] }))
    );
    const sdk = new ContentRuntime(f.options),
      ordinary = vi.spyOn(Runtime.prototype, 'fetchExperience').mockResolvedValue(plan);
    await expect(sdk.fetchExperience({ experienceId: 'hero' }, resolve)).resolves.toEqual(plan);
    expect(ordinary).toHaveBeenCalledOnce();
    await expect(
      sdk.fetchExperience({ experienceId: 'hero', locale: 'de-DE' }, resolve)
    ).rejects.toThrow(/locale is server-owned/);
    expect(ordinary).toHaveBeenCalledOnce();
  });

  it('routes subscriptions by actual payload ID, shares resolution and ignores detached or expired consumers', async () => {
    const sdk = new ContentRuntime(preview().options),
      pending = deferred<PortableRenderPlan>();
    const resolvePlan = vi.spyOn(sdk, 'resolveExperience').mockReturnValue(pending.promise);
    const first = vi.fn(),
      second = vi.fn(),
      other = vi.fn();
    const a = sdk.subscribeToPreview('hero', resolve, first),
      b = sdk.subscribeToPreview('hero', resolve, second),
      c = sdk.subscribeToPreview('footer', resolve, other);
    subscriptions.push(a, b, c);
    expect(resolvePlan).not.toHaveBeenCalled();
    sdk.source({
      data: { sys: { type: 'Experience' }, nodes: [] },
      error: undefined,
      status: 'live',
      revision: 1,
    });
    expect(resolvePlan).not.toHaveBeenCalled();
    sdk.source({
      data: { sys: { type: 'Experience', id: 'hero' }, nodes: [] },
      error: undefined,
      status: 'live',
      revision: 2,
    });
    expect(resolvePlan).toHaveBeenCalledOnce();
    a.unsubscribe();
    pending.resolve(plan);
    await vi.waitFor(() => expect(second).toHaveBeenCalledWith({ data: plan, error: undefined }));
    expect(first).not.toHaveBeenCalled();
    expect(other).not.toHaveBeenCalled();
    const old = deferred<PortableRenderPlan>();
    resolvePlan.mockReturnValueOnce(old.promise);
    sdk.source({
      data: { sys: { type: 'Experience', id: 'hero' }, nodes: [] },
      error: undefined,
      status: 'live',
      revision: 3,
    });
    second.mockClear();
    sdk.reset();
    old.resolve(plan);
    await old.promise;
    expect(second).not.toHaveBeenCalled();
    b.unsubscribe();
    c.unsubscribe();
  });
});

describe('WebContentRuntime per-call data and locale', () => {
  it('forwards changed parameters without retaining fetch values', async () => {
    const fetch = vi.spyOn(Runtime.prototype, 'fetchExperience').mockResolvedValue(plan);
    const runtime = new ContentRuntime({ defaults: { consent: false } });
    const parameters = { featuredPosts: { limit: 6, order: '-fields.title' } };
    await runtime.fetchExperience(
      { experienceId: 'exp', parameters },
      { config: { components: {} } }
    );
    await runtime.fetchExperience(
      { experienceId: 'exp', parameters: { featuredPosts: { limit: 12 } } },
      { config: { components: {} } }
    );
    await runtime.fetchExperience({ experienceId: 'exp' }, { config: { components: {} } });
    expect(fetch.mock.calls.map(([options]) => options.parameters)).toEqual([
      parameters,
      { featuredPosts: { limit: 12 } },
      undefined,
    ]);
  });

  it('uses mutable defaults while forwarding each per-call locale and resolver config', async () => {
    const runtime = new ContentRuntime();
    const defaultResolveOptions = { config: { components: {} } };
    const frenchResolveOptions = { config: { components: {}, experienceTemplates: {} } };
    const fetch = vi.spyOn(Runtime.prototype, 'fetchExperience').mockResolvedValue(plan);
    const setApiLocale = vi.spyOn(runtime.api.personalization, 'setLocale');

    runtime.setLocale('de-DE');
    expect(setApiLocale).toHaveBeenCalledExactlyOnceWith('de-DE');
    expect(runtime.locale).toBe('de-DE');
    expect(runtime.eventBuilder.buildTrack({ event: 'locale' }).context.locale).toBe('de-DE');

    await runtime.fetchExperience({ experienceId: 'default' }, defaultResolveOptions);
    await runtime.fetchExperience(
      { experienceId: 'per-call', locale: 'fr-FR' },
      frenchResolveOptions
    );

    expect(fetch).toHaveBeenNthCalledWith(1, { experienceId: 'default' }, defaultResolveOptions);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      {
        experienceId: 'per-call',
        locale: 'fr-FR',
      },
      frenchResolveOptions
    );
  });
});

describe('WebContentRuntime acquisition and diagnostics', () => {
  it('validates selectors before preview acquisition or page-event preparation', async () => {
    const f = preview();
    const sdk = new ContentRuntime(f.options);
    const ordinary = vi.spyOn(Runtime.prototype, 'fetchExperience').mockResolvedValue(plan);
    const invalid = {
      experienceId: 'hero',
      destinationId: 'site',
      path: '/',
      personalization: { events: [{ type: 'page' }] },
    } as never;
    await expect(sdk.fetchExperience(invalid, resolve)).rejects.toBeInstanceOf(TypeError);
    expect(f.fetch).not.toHaveBeenCalled();
    sdk.stop();

    const browser = new ContentRuntime({ defaults: { consent: true } });
    const build = vi.spyOn(browser.eventBuilder, 'buildPageView');
    await expect(
      browser.fetchExperience(invalid, resolve, { routeKey: '/' })
    ).rejects.toBeInstanceOf(TypeError);
    expect(build).not.toHaveBeenCalled();
    expect(ordinary).not.toHaveBeenCalled();
  });

  it.each(['reset', 'destroy'] as const)(
    'discards a pending snapshot after %s',
    async (operation) => {
      const f = preview();
      const hold = deferred<globalThis.Response>();
      f.fetch.mockReturnValueOnce(hold.promise);
      const sdk = new ContentRuntime(f.options);
      const ordinary = vi.spyOn(Runtime.prototype, 'fetchExperience').mockResolvedValue(plan);
      const pending = sdk.fetchExperience({ experienceId: 'other' }, resolve);
      await vi.waitFor(() => expect(f.fetch).toHaveBeenCalledOnce());
      if (operation === 'destroy') sdk.stop();
      else sdk.reset();
      hold.resolve(
        new globalThis.Response(
          JSON.stringify({ sys: { type: 'Experience', id: 'hero' }, nodes: [] })
        )
      );
      await expect(pending).rejects.toThrow(operation === 'destroy' ? /destroyed/ : /superseded/);
      expect(ordinary).not.toHaveBeenCalled();
    }
  );

  it('delivers usable preview nodes and every resolver diagnostic', async () => {
    const f = preview(),
      sdk = new ContentRuntime(f.options);
    const next = vi.fn();
    const subscription = sdk.subscribeToPreview('hero', resolve, next);

    sdk.source({
      data: {
        sys: { type: 'Experience', id: 'hero' },
        extensions: {
          personalization: {
            profile: completeProfile('preview-profile'),
            changes: [
              {
                type: 'Variable',
                key: 'banner',
                value: false,
                meta: { experienceId: 'experiment', variantIndex: 0 },
              },
            ],
          },
        },
        nodes: [
          {
            component: {
              sys: {
                type: 'ResourceLink',
                linkType: 'Contentful:Component',
                urn: 'crn:contentful:::experience:spaces/$self/environments/$self/components/Heading',
              },
            },
            contentProperties: { text: 'fresh' },
          },
          {},
          {},
        ],
      } as ExperiencePayload,
      error: undefined,
      status: 'live',
      revision: 1,
    });
    await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());
    const update = next.mock.calls[0]![0];
    expect(update.data.nodes).toHaveLength(1);
    expect(update.data.nodes[0].props.content.text).toBe('fresh');
    expect(update.data.diagnostics).toHaveLength(2);
    expect(update.error).toBeUndefined();
    expect(sdk.getFlag('banner')).toBe(false);
    expect(sdk.states.profile.current).toBeUndefined();
    subscription.unsubscribe();
  });

  it.each([
    ['master', 'hero', true],
    ['master', 'other', false],
    ['branch', 'hero', false],
  ])(
    'selects destination preview only for actual identity and scope (%s, %s)',
    async (environmentId, experienceId, edited) => {
      const f = preview();
      const payloadRuntime = Runtime.prototype as unknown as {
        fetchExperiencePayload(): Promise<ExperiencePayload>;
      };
      const acquisition = vi.spyOn(payloadRuntime, 'fetchExperiencePayload').mockResolvedValue({
        sys: { id: experienceId, type: 'Experience' },
        nodes: [],
        errors: [{ message: 'ordinary' }],
      });
      const sdk = new ContentRuntime({
        sessionId: f.options.sessionId,
        environmentId,
        preview: { ...f.options.preview, createClient: undefined },
      });
      const resolvePayload = vi.spyOn(Runtime.prototype, 'resolveExperience');
      const result = await sdk.fetchExperience({ destinationId: 'dest', path: '/' }, resolve);
      expect(result).toMatchObject({ experienceId });
      expect(acquisition).toHaveBeenCalledOnce();
      expect(resolvePayload).toHaveBeenCalledOnce();
      expect(resolvePayload.mock.calls[0]?.[0].errors).toEqual(
        edited ? undefined : [{ message: 'ordinary' }]
      );
      if (environmentId !== 'master') expect(f.fetch).not.toHaveBeenCalled();
    }
  );
});

describe('WebContentRuntime attribution request policy', () => {
  it.each([true, false])(
    'requests attribution from automatic policy %s independently of event consent',
    async (automatic) => {
      const runtime = new ContentRuntime({ defaults: { consent: false } });
      runtime.trackingPolicy.hasAutoTracking.mockReturnValue(automatic);
      const fetch = vi.spyOn(Runtime.prototype, 'fetchExperience').mockResolvedValue(plan);
      const resolveOptions = { config: { components: {} } };
      expect(runtime.hasConsent('trackClick')).toBe(false);
      await runtime.fetchExperience({ experienceId: 'automatic' }, resolveOptions);
      expect(fetch).toHaveBeenCalledExactlyOnceWith(
        automatic
          ? { experienceId: 'automatic', extensions: { sourceMap: {} } }
          : { experienceId: 'automatic' },
        resolveOptions
      );
    }
  );

  it.each([true, false])(
    'preserves frozen caller source-map options with automatic policy %s',
    async (automatic) => {
      const runtime = new ContentRuntime();
      runtime.trackingPolicy.hasAutoTracking.mockReturnValue(automatic);
      const fetch = vi.spyOn(Runtime.prototype, 'fetchExperience').mockResolvedValue(plan);
      const sourceMap = Object.freeze({});
      const extensions = Object.freeze({ sourceMap });
      const options = Object.freeze({ experienceId: 'explicit-map', extensions });
      const resolveOptions = { config: { components: {} } };
      await runtime.fetchExperience(options, resolveOptions);
      expect(fetch).toHaveBeenCalledExactlyOnceWith(options, resolveOptions);
      expect(fetch.mock.calls[0]?.[0].extensions?.sourceMap).toBe(sourceMap);
      expect(options.extensions).toBe(extensions);
      expect(options).toEqual({ experienceId: 'explicit-map', extensions: { sourceMap: {} } });
    }
  );
});
