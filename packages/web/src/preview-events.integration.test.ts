// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeEventMethods } from '@contentful/experiences-runtime';
import { getPageProperties } from './browser-event-context.js';
import { ContentfulExperiences as NodeExperiences } from '../../node/src/contentful-experiences.js';
import { ContentfulExperiences as WebExperiences } from './contentful-experiences.js';
import { clearIdentityCookies, seedConsent } from './test-fixtures/consent.js';
import { installIOPolyfill, setDocumentVisibility } from './test-fixtures/dom.js';
import { getTrackingAttributes } from './tracking-attributes.js';

const active = new Set<NodeExperiences | WebExperiences>();
const cleanups: (() => void)[] = [];
const skipped = { accepted: false, reason: 'preview' };
const resolver = { config: { components: {} } };
const config = {
  spaceId: 'space',
  environmentId: 'environment',
  delivery: { accessToken: 'token' },
};
const interaction = { entityId: 'hero', entityKind: 'ExperienceFragment' as const };
const link = (linkType: string, id: string) => ({ sys: { type: 'Link', linkType, id } });
const visitor = {
  message: 'ok',
  error: null,
  data: {
    changes: [],
    experiences: [],
    profile: {
      id: 'visitor',
      stableId: 'visitor',
      random: 0.5,
      audiences: [],
      traits: {},
      location: {},
      session: {
        id: 'session',
        isReturningVisitor: false,
        count: 1,
        activeSessionLength: 0,
        averageSessionLength: 0,
        landingPage: getPageProperties(),
      },
    },
  },
};
const payload = {
  sys: {
    id: 'exp',
    type: 'Experience',
    space: link('Space', 'space'),
    environment: link('Environment', 'environment'),
    experienceTemplate: {
      sys: {
        type: 'ResourceLink',
        linkType: 'Contentful:ExperienceTemplate',
        urn: 'crn:contentful:::experience:spaces/space/environments/environment/experience_templates/template',
      },
    },
    createdAt: '2026-10-26T00:00:00.000Z',
    updatedAt: '2026-10-26T00:00:00.000Z',
    createdBy: link('User', 'editor'),
    updatedBy: link('User', 'editor'),
  },
  nodes: [],
  errors: [],
  extensions: { personalization: visitor.data },
};

function node() {
  const sdk = new NodeExperiences(config);
  active.add(sdk);
  return sdk;
}

function web(options: Partial<ConstructorParameters<typeof WebExperiences>[0]> = {}) {
  const sdk = new WebExperiences({ ...config, ...options });
  active.add(sdk);
  return sdk;
}

function allEvents(runtime: Omit<RuntimeEventMethods, 'profile'>) {
  return Promise.all([
    runtime.identify({ userId: 'editor' }),
    runtime.page(),
    runtime.track({ event: 'preview' }),
    runtime.trackView({ ...interaction, viewId: 'view', viewDurationMs: 100 }),
    runtime.trackClick(interaction),
    runtime.trackHover({ ...interaction, hoverId: 'hover', hoverDurationMs: 100 }),
    runtime.trackFlagView({ componentId: 'flag' }),
  ]);
}

// Capture serialized requests from real API clients, including the generated Delivery client.
function http() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    return new globalThis.Response(
      url.includes('insights') ? '' : JSON.stringify(url.includes('/profiles') ? visitor : payload),
      { status: 200 }
    );
  });
}

beforeEach(() => {
  seedConsent({ events: true, persistence: true });
  window.history.replaceState({}, '', '/?preview_session_id=session-1');
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  for (const sdk of active) sdk.destroy();
  active.clear();
  document.body.replaceChildren();
  window.localStorage.clear();
  clearIdentityCookies();
  window.history.replaceState({}, '', '/');
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Session preview event isolation', () => {
  it.each([undefined, { accessToken: 'preview-token' }])(
    'skips all browser calls before a profile or connection (CPA %j)',
    async (preview) => {
      const fetch = http();
      const blocked = vi.fn();
      const sdk = web({ preview, onEventBlocked: blocked });
      const hook = vi.fn((event) => event);
      sdk.interceptors.event.add(hook);
      const emitted = vi.fn();
      const subscription = sdk.states.eventStream.subscribe(emitted);
      cleanups.push(() => subscription.unsubscribe());
      emitted.mockClear();
      expect(sdk.isPreview).toBe(true);
      expect(sdk.hasConsent('track')).toBe(true);
      expect(await allEvents(sdk)).toEqual(Array(7).fill(skipped));
      expect(blocked.mock.calls.map(([event]) => event.reason)).toEqual(Array(7).fill('preview'));
      expect(sdk.states.blockedEventStream.current?.reason).toBe('preview');
      expect(hook).not.toHaveBeenCalled();
      expect(emitted).not.toHaveBeenCalled();
      await sdk.flush();
      sdk.destroy();
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it('isolates concurrent Node delivery and skips preview preflight and browser replay', async () => {
    const fetch = http();
    const server = node();
    const context = { isPreview: true, consent: true };
    const preview = server.forRequest(context);
    context.isPreview = false;
    const delivery = server.forRequest({ consent: true });
    const [results, admitted] = await Promise.all([allEvents(preview), delivery.page()]);
    expect(results).toEqual(Array(7).fill(skipped));
    expect(admitted.accepted).toBe(true);
    expect(preview.isPreview).toBe(true);
    expect(preview.canPersistProfile).toBe(true);
    expect(preview.profile).toBeUndefined();
    expect((await allEvents(delivery)).every((result) => result.accepted)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(8);
    const handoff = await delivery.prepareRequestHandoff({ routeKey: '/' });
    fetch.mockClear();
    expect(
      await preview.prepareRequestHandoff({
        routeKey: '/',
        initialEvents: [{ type: 'identify', userId: 'editor' }],
      })
    ).toEqual({
      handoff: {
        spaceId: config.spaceId,
        environmentId: config.environmentId,
        cache: { scope: 'private-request' },
      },
      skipped: 'preview',
    });
    const sdk = web();
    const buildPayload = vi.fn(() => ({}));
    await sdk.hydrateHandoffState(handoff.handoff, { routeKey: '/' });
    expect(
      await sdk.hydrateAndTrackCurrentPage(handoff.handoff, { routeKey: '/', buildPayload })
    ).toEqual(skipped);
    expect(await sdk.trackCurrentPage({ routeKey: '/', buildPayload })).toEqual(skipped);
    expect(buildPayload).not.toHaveBeenCalled();
    expect(sdk.states.profile.current).toBeUndefined();
    await sdk.flush();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('omits embedded events/profile on the wire and ignores a returned profile in both runtimes', async () => {
    const fetch = http();
    const sdk = web({ defaults: { profile: { id: 'browser' } } });
    const request = node().forRequest({
      isPreview: true,
      consent: true,
      profile: { id: 'server' },
    });
    const page = sdk.eventBuilder.buildPageView();
    const input = {
      experienceId: 'exp',
      parameters: { productId: 'sku' },
      extensions: { sourceMap: {} },
      personalization: { profileId: 'input', events: [page] },
    };
    const original = globalThis.structuredClone(input);
    const plans = await Promise.all([
      request.fetchExperience(input, resolver),
      sdk.fetchExperience(input, resolver),
    ]);
    expect(plans.map((plan) => plan.personalization?.profileId)).toEqual(
      Array(2).fill(visitor.data.profile.id)
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [, options] of fetch.mock.calls) {
      expect(JSON.parse(String(options?.body))).toEqual({
        parameters: input.parameters,
        extensions: { sourceMap: {} },
      });
    }
    expect(input).toEqual(original);
    expect(request.profile?.id).toBe('server');
    expect(sdk.states.profile.current?.id).toBe('browser');
  });

  it('suppresses automatic/manual measurement, offline/timer flushes, page hide and teardown', async () => {
    vi.useFakeTimers();
    const io = installIOPolyfill();
    setDocumentVisibility('visible');
    const fetch = http();
    const beacon = vi.fn(() => true);
    vi.stubGlobal('navigator', { ...window.navigator, onLine: true, sendBeacon: beacon });
    const sdk = web({ defaults: { profile: { id: 'existing' } } });
    const element = document.createElement('button');
    for (const [key, value] of Object.entries(getTrackingAttributes({ roots: [{ key: 'hero' }] })))
      element.setAttribute(key, value);
    element.setAttribute(
      'data-ctfl-attribution',
      JSON.stringify({ scopes: { hero: interaction } })
    );
    document.body.append(element);
    for (const type of ['views', 'clicks', 'hovers'] as const) {
      sdk.tracking.enable(type);
      sdk.tracking.enableElement(type, element, { data: interaction });
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(io.getLast).toThrow('IntersectionObserver polyfill instance not found');
    io.trigger(element, true);
    element.click();
    element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    window.dispatchEvent(new Event('offline'));
    await allEvents(sdk);
    await vi.advanceTimersByTimeAsync(31_000);
    io.trigger(element, false);
    element.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    window.dispatchEvent(new Event('online'));
    setDocumentVisibility('hidden');
    await sdk.flush();
    sdk.destroy();
    await vi.advanceTimersByTimeAsync(31_000);
    expect(fetch).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
  });

  it('retains preview through reset/URL/consent changes and creates clean delivery after disposal', async () => {
    const fetch = http();
    const sdk = web();
    await allEvents(sdk);
    window.history.replaceState({}, '', '/delivery');
    sdk.reset();
    sdk.consent(true);
    expect(await sdk.page()).toEqual(skipped);
    sdk.destroy();
    const delivery = web({
      preview: { accessToken: 'preview-token' },
      resolveDefaults: { debug: true },
    });
    expect(delivery.isPreview).toBe(false);
    expect((await delivery.page()).accepted).toBe(true);
    await delivery.trackClick(interaction);
    await delivery.flush();
    expect(fetch).toHaveBeenCalledTimes(2);
    const bodies = fetch.mock.calls.map(([, options]) => JSON.parse(String(options?.body)));
    expect(bodies[0].events.map((event: { type: string }) => event.type)).toEqual(['page']);
    expect(bodies[1][0].events.map((event: { type: string }) => event.type)).toEqual([
      'exo_node_click',
    ]);
  });

  it.each(['', '   '])('ignores empty URL IDs: %j', (sessionId) => {
    window.history.replaceState({}, '', `/?preview_session_id=${encodeURIComponent(sessionId)}`);
    expect(web().isPreview).toBe(false);
  });

  it.each([undefined, false])(
    'keeps Node in delivery without isPreview: true (%j)',
    (isPreview) => {
      expect(node().forRequest({ isPreview }).isPreview).toBe(false);
    }
  );

  it('accepts an explicit true without a URL ID', async () => {
    const fetch = http();
    window.history.replaceState({}, '', '/');
    const sdk = web({ isPreview: true });
    expect(sdk.isPreview).toBe(true);
    expect(await allEvents(sdk)).toEqual(Array(7).fill(skipped));
    await sdk.flush();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('honors explicit false over a URL Session ID', async () => {
    const fetch = http();
    const sdk = web({ isPreview: false });
    expect(sdk.isPreview).toBe(false);
    expect((await sdk.page()).accepted).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();
  });
});
