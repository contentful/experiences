// @vitest-environment jsdom

import {
  ContentfulExperiences as RuntimeContentfulExperiences,
  type OptimizationEventStreamEvent,
} from '@contentful/experiences-runtime';
import { ExperienceApiClient, InsightsApiClient } from '@contentful/optimization-api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContentfulExperiences, type ExperiencesWebConfig } from './contentful-experiences.js';
import { clearIdentityCookies, seedConsent } from './test-fixtures/consent.js';
import { deferred } from './test-fixtures/dom.js';

const runtimes = new Set<ContentfulExperiences>();
const resolveOptions = { config: { components: {} } };
const entity = { entityId: 'hero', entityKind: 'Experience' } as const;
const view = { ...entity, viewId: 'view', viewDurationMs: 1000 };
const hover = { ...entity, hoverId: 'hover', hoverDurationMs: 1000 };

function createRuntime(config: Partial<ExperiencesWebConfig> = {}) {
  const runtime = new ContentfulExperiences({
    spaceId: 'space',
    environmentId: 'environment',
    delivery: { accessToken: 'delivery-token' },
    defaults: { profile: { id: 'visitor' }, consent: false },
    ...config,
  });
  runtimes.add(runtime);
  return runtime;
}

beforeEach(() => {
  seedConsent({ events: false, persistence: false });
  vi.spyOn(ExperienceApiClient.prototype, 'upsertProfile').mockResolvedValue({
    profile: { id: 'visitor' },
  } as never);
  vi.spyOn(InsightsApiClient.prototype, 'sendBatchEvents').mockResolvedValue(true);
});

afterEach(() => {
  for (const runtime of runtimes) runtime.destroy();
  runtimes.clear();
  vi.restoreAllMocks();
  window.localStorage.clear();
  clearIdentityCookies();
});

describe('Web event interception consent', () => {
  it('applies final Personalization consent before Web publication', async () => {
    const onEventBlocked = vi.fn();
    const runtime = createRuntime({ onEventBlocked });
    const hook = vi.fn((event: OptimizationEventStreamEvent) => ({
      ...event,
      type: 'track' as const,
      event: 'rewritten',
    }));
    runtime.interceptors.event.add(hook);

    await expect(runtime.page()).resolves.toEqual({ accepted: false });
    expect(hook).toHaveBeenCalledTimes(1);
    expect(onEventBlocked).toHaveBeenCalledExactlyOnceWith({
      reason: 'consent',
      method: 'track',
      args: [expect.objectContaining({ type: 'track', event: 'rewritten' })],
    });
    expect(runtime.states.eventStream.current).toBeUndefined();
    expect(ExperienceApiClient.prototype.upsertProfile).not.toHaveBeenCalled();
  });

  it('reports final Analytics refusal through the Web admission callback', async () => {
    const onEventBlocked = vi.fn();
    const runtime = createRuntime({ onEventBlocked, allowedEventTypes: ['component'] });
    runtime.interceptors.event.add(() => runtime.eventBuilder.buildHover(hover));
    await expect(runtime.trackView(view)).resolves.toEqual({ accepted: false });
    expect(onEventBlocked).toHaveBeenCalledExactlyOnceWith({
      reason: 'consent',
      method: 'trackHover',
      args: [expect.objectContaining({ type: 'exo_node_hover' })],
    });
    expect(runtime.states.eventStream.current).toBeUndefined();
    await runtime.flush();
    expect(InsightsApiClient.prototype.sendBatchEvents).not.toHaveBeenCalled();
  });

  it('uses current consent when an async hook transforms an admitted page', async () => {
    const runtime = createRuntime();
    const gate = deferred<void>();
    const started = deferred<void>();
    runtime.interceptors.event.add(async (event) => {
      started.resolve();
      await gate.promise;
      return { ...event, type: 'track', event: 'now-admitted' };
    });
    const pending = runtime.page();
    await started.promise;
    runtime.consent({ events: true });
    gate.resolve();
    await expect(pending).resolves.toMatchObject({ accepted: true });
    expect(runtime.states.eventStream.current).toMatchObject({
      type: 'track',
      event: 'now-admitted',
    });
    expect(ExperienceApiClient.prototype.upsertProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        events: [expect.objectContaining({ type: 'track', event: 'now-admitted' })],
      }),
      expect.anything()
    );
  });

  it.each(['timestamp', 'gdpr', 'title', 'context'])(
    'rejects invalid final XDA hook output (%s) before reporting a valid earlier blocked type',
    async (field) => {
      const onEventBlocked = vi.fn();
      const runtime = createRuntime({ onEventBlocked });
      const first = runtime.eventBuilder.buildPageView();
      const second = runtime.eventBuilder.buildPageView();
      const hook = vi.fn((event: OptimizationEventStreamEvent) =>
        event.messageId === first.messageId
          ? { ...event, type: 'track' as const, event: 'blocked' }
          : ({
              ...event,
              ...(field === 'timestamp'
                ? { timestamp: 123 }
                : field === 'context'
                  ? { context: null }
                  : {
                      context: {
                        ...event.context,
                        ...(field === 'gdpr'
                          ? { gdpr: { isConsentGiven: 'yes' } }
                          : { page: { ...second.context.page, title: 123 } }),
                      },
                    }),
            } as never)
      );
      runtime.interceptors.event.add(hook);
      const fetch = vi.spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience');
      await expect(
        runtime.fetchExperience(
          { experienceId: 'invalid', personalization: { events: [first, second] } },
          resolveOptions
        )
      ).rejects.toThrow('Invalid Experience personalization');
      expect(onEventBlocked).not.toHaveBeenCalled();
      expect(runtime.states.eventStream.current).toBeUndefined();
      expect(fetch).not.toHaveBeenCalled();
      expect(hook).toHaveBeenCalledTimes(2);
    }
  );

  it('serializes the entire XDA batch before filtering final types and preserves the fetch/profile', async () => {
    const onEventBlocked = vi.fn();
    const runtime = createRuntime({ onEventBlocked });
    const fetch = vi
      .spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience')
      .mockResolvedValue({ nodes: [] } as never);
    const page = runtime.eventBuilder.buildPageView();
    runtime.interceptors.event.add((event) => ({ ...event, type: 'track', event: 'rewritten' }));
    await runtime.fetchExperience(
      { experienceId: 'exp', personalization: { profileId: 'caller-profile', events: [page] } },
      resolveOptions
    );
    expect(fetch.mock.calls[0]?.[0].personalization).toEqual({
      profileId: 'caller-profile',
      events: [],
    });
    expect(onEventBlocked).toHaveBeenCalledWith(expect.objectContaining({ method: 'track' }));
    expect(runtime.states.eventStream.current).toBeUndefined();
  });

  it('passes concurrent XDA hook results to the fetch in input order', async () => {
    const runtime = createRuntime({ defaults: { consent: false } });
    const fetch = vi
      .spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience')
      .mockResolvedValue({ nodes: [] } as never);
    const first = deferred<void>();
    const secondStarted = deferred<void>();
    runtime.interceptors.event.add(async (event) => {
      const name = event.type === 'track' ? event.event : event.type;
      expect(event.context).toMatchObject({ gdpr: { isConsentGiven: true } });
      if (name === 'first') await first.promise;
      else secondStarted.resolve();
      Object.assign(event.context, { gdpr: { isConsentGiven: false } });
      return { ...event, event: `updated:${name}` };
    });
    const events = [
      runtime.eventBuilder.buildTrack({ event: 'first' }),
      runtime.eventBuilder.buildTrack({ event: 'second' }),
    ];
    Object.assign(events[0]!.context.gdpr, { isConsentGiven: 'yes' });
    const original = globalThis.structuredClone(events);
    runtime.consent({ events: true });
    const pending = runtime.fetchExperience(
      { experienceId: 'exp', personalization: { events } },
      resolveOptions
    );
    await secondStarted.promise;
    first.resolve();
    await pending;
    expect(
      fetch.mock.calls[0]?.[0].personalization?.events?.map(
        (event) => event.type === 'track' && event.event
      )
    ).toEqual(['updated:first', 'updated:second']);
    expect(runtime.states.eventStream.current).toMatchObject({
      context: { gdpr: { isConsentGiven: false } },
    });
    expect(events).toEqual(original);
  });

  it('reports an unmapped valid transformed XDA type using its wire name', async () => {
    const onEventBlocked = vi.fn();
    const runtime = createRuntime({ onEventBlocked });
    const fetch = vi
      .spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience')
      .mockResolvedValue({ nodes: [] } as never);
    runtime.interceptors.event.add(
      (event) => ({ ...event, type: 'screen', properties: { name: 'screen' } }) as never
    );
    await runtime.fetchExperience(
      { experienceId: 'exp', personalization: { events: [runtime.eventBuilder.buildPageView()] } },
      resolveOptions
    );
    expect(onEventBlocked).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'screen',
        args: [expect.objectContaining({ type: 'screen' })],
      })
    );
    expect(fetch.mock.calls[0]?.[0].personalization?.events).toEqual([]);
  });

  it.each(['reset', 'destroy'] as const)(
    'discards pending direct and XDA hooks after %s',
    async (action) => {
      const runtime = createRuntime({ defaults: { consent: true, profile: { id: 'visitor' } } });
      const gate = deferred<void>();
      const hook = vi.fn(async (event: OptimizationEventStreamEvent) => {
        await gate.promise;
        return event;
      });
      runtime.interceptors.event.add(hook);
      const fetch = vi.spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience');
      const page = runtime.page();
      const pendingView = runtime.trackView(view);
      const xda = runtime.fetchExperience(
        {
          experienceId: 'stale',
          personalization: { events: [runtime.eventBuilder.buildPageView()] },
        },
        resolveOptions
      );
      const xdaRejected = expect(xda).rejects.toThrow(
        action === 'reset' ? 'superseded' : 'destroyed'
      );
      expect(hook).toHaveBeenCalledTimes(3);
      runtime[action]();
      gate.resolve();
      await Promise.all([page, pendingView, xdaRejected]);
      expect(fetch).not.toHaveBeenCalled();
      expect(ExperienceApiClient.prototype.upsertProfile).not.toHaveBeenCalled();
      expect(InsightsApiClient.prototype.sendBatchEvents).not.toHaveBeenCalled();
      expect(runtime.states.eventStream.current).toBeUndefined();
    }
  );

  it('rechecks current consent after an async hook and stops XDA when blocked reporting resets its owner', async () => {
    const runtime = createRuntime({ onEventBlocked: () => runtime.reset() });
    const gate = deferred<void>();
    runtime.interceptors.event.add(async (event) => {
      await gate.promise;
      return { ...event, type: 'track', event: 'changed' };
    });
    const fetch = vi.spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience');
    const pending = runtime.fetchExperience(
      {
        experienceId: 'cancelled',
        personalization: { events: [runtime.eventBuilder.buildPageView()] },
      },
      resolveOptions
    );
    const rejected = expect(pending).rejects.toThrow('superseded');
    gate.resolve();
    await rejected;
    expect(fetch).not.toHaveBeenCalled();
  });
});
