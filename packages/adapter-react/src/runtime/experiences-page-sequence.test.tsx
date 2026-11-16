/** @vitest-environment jsdom */

import { act, StrictMode, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createWebSnapshotRuntime,
  signals,
  toObservable,
  type ContentfulExperiences,
  type ExperiencesHandoff,
} from '@contentful/experiences-web';
import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';
import { ExperiencesContext } from './experiences-context.js';
import {
  useExperienceRequestContext,
  type ExperienceRequestContextValue,
} from './experience-request-context.js';
import { createReactTestRoot, type ReactTestRoot } from '../test/react-root.js';
import { profileFixture } from '../test/profile.js';
import {
  ExperiencesPageSequence,
  type BeforeInitialPageOptions,
} from './experiences-page-sequence.js';

const plan: PortableRenderPlan = { nodes: [], metadata: {}, debug: false, diagnostics: [] };
const config = { components: {} };
const resetRevision = {};
const onReset = () => undefined;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

describe('React route request and page coordination', () => {
  let view: ReactTestRoot;
  let runtime: ContentfulExperiences;
  let consent: typeof signals.consent;
  let requests: ExperienceRequestContextValue;
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    view = createReactTestRoot();
    consent = signals.consent;
    consent.value = false;
    signals.personalizationRequestState.value = { status: 'idle' };
    signals.profile.value = undefined;
    runtime = Object.assign(createWebSnapshotRuntime(), {
      states: {
        ...createWebSnapshotRuntime().states,
        consent: toObservable(consent),
        profile: toObservable(signals.profile),
        personalizationRequestState: toObservable(signals.personalizationRequestState),
      },
      isPreview: false,
      fetchExperience: vi.fn().mockResolvedValue(plan),
      trackCurrentPage: vi.fn().mockResolvedValue({ accepted: true }),
      hasConsent: vi.fn(() => consent.value === true),
    }) as unknown as ContentfulExperiences;
  });
  afterEach(async () => {
    await act(async () => view.cleanup());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  function Probe({ fetch = false }: { fetch?: boolean }) {
    requests = useExperienceRequestContext()!;
    useEffect(() => {
      if (fetch)
        void requests
          .fetchExperience(runtime, { experienceId: 'home' }, { config }, false)
          .catch(() => undefined);
    }, [fetch, requests]);
    return <span>retained child</span>;
  }
  async function render({
    routeKey = '/',
    handoff,
    beforeInitialPage,
    fetch = false,
    strict = false,
    reset,
  }: {
    routeKey?: string;
    handoff?: ExperiencesHandoff;
    beforeInitialPage?: BeforeInitialPageOptions;
    fetch?: boolean;
    strict?: boolean;
    reset?: object;
  } = {}) {
    const tree = (
      <ExperiencesContext.Provider
        value={{ sdk: runtime, isLive: true, isContentReady: true, error: undefined }}
      >
        <ExperiencesPageSequence
          routeKey={routeKey}
          handoff={handoff}
          beforeInitialPage={beforeInitialPage}
          buildPagePayload={() => ({ properties: { route: routeKey } })}
          resetRevision={reset ?? resetRevision}
          onReset={onReset}
        >
          <Probe fetch={fetch} />
        </ExperiencesPageSequence>
      </ExperiencesContext.Provider>
    );
    await act(async () => view.render(strict ? <StrictMode>{tree}</StrictMode> : tree));
  }
  it('joins the initial supported request during Strict Mode without a synthetic page commit', async () => {
    await render({ fetch: true, strict: true });
    expect(runtime.fetchExperience).toHaveBeenCalledTimes(1);
    expect(runtime.fetchExperience).toHaveBeenCalledWith(
      {
        experienceId: 'home',
        personalization: {
          events: [{ type: 'page', properties: { route: '/' } }],
        },
      },
      { config }
    );
    expect(runtime.trackCurrentPage).not.toHaveBeenCalled();
  });
  it('keeps explicit nonpage intent intact and bypasses page injection for controller-sanitized refresh', async () => {
    await render();
    const request = {
      experienceId: 'home',
      personalization: {
        profileId: 'visitor',
        events: [{ type: 'track' as const, event: 'custom' }],
      },
    };
    await requests.fetchExperience(runtime, request, { config }, false);
    const refresh = { ...request, personalization: { profileId: 'visitor' } };
    await requests.fetchExperience(runtime, refresh, { config }, true);
    expect(runtime.fetchExperience).toHaveBeenNthCalledWith(1, request, { config });
    expect(runtime.fetchExperience).toHaveBeenNthCalledWith(2, refresh, { config });
    expect(request.personalization.events).toHaveLength(1);
    await act(async () => {
      consent.value = true;
    });
    expect(runtime.trackCurrentPage).not.toHaveBeenCalled();
  });
  it('does not let a pending refresh supply a new presentation initial request', async () => {
    const refreshed = deferred<PortableRenderPlan>();
    const initialized = deferred<PortableRenderPlan>();
    const refreshPlan = { ...plan, metadata: { source: 'refresh' } };
    vi.mocked(runtime.fetchExperience)
      .mockReturnValueOnce(refreshed.promise)
      .mockReturnValueOnce(initialized.promise);
    await render();
    const refreshInput = Object.freeze({ experienceId: 'home' });
    const initialInput = Object.freeze({ experienceId: 'home' });
    const refreshing = requests.fetchExperience(runtime, refreshInput, { config }, true);
    await Promise.resolve();
    const initial = requests.fetchExperience(runtime, initialInput, { config }, false);
    try {
      expect(initial).not.toBe(refreshing);
      const joined = requests.fetchExperience(runtime, initialInput, { config }, false);
      expect(joined).toBe(initial);
      await Promise.resolve();
      expect(runtime.fetchExperience).toHaveBeenCalledTimes(2);
      expect(runtime.fetchExperience).toHaveBeenNthCalledWith(1, refreshInput, { config });
      expect(runtime.fetchExperience).toHaveBeenNthCalledWith(
        2,
        {
          experienceId: 'home',
          personalization: { events: [{ type: 'page', properties: { route: '/' } }] },
        },
        { config }
      );
      initialized.resolve(plan);
      await expect(initial).resolves.toBe(plan);
      expect(initialInput).toEqual({ experienceId: 'home' });
      expect(runtime.trackCurrentPage).not.toHaveBeenCalled();
    } finally {
      initialized.resolve(plan);
      refreshed.resolve(refreshPlan);
      await expect(refreshing).resolves.toBe(refreshPlan);
    }
  });
  it.each(['parameters', 'locale', 'metadata', 'registry', 'debug'] as const)(
    'does not reuse a pending plan after the actual %s descriptor changes',
    async (changed) => {
      const pending = deferred<PortableRenderPlan>();
      vi.mocked(runtime.fetchExperience).mockReturnValueOnce(pending.promise);
      await render();
      const request = { experienceId: 'home', locale: 'en-US', parameters: { campaign: 'one' } };
      const resolve = { config, metadata: { label: 'one' }, debug: false };
      const first = requests.fetchExperience(runtime, request, resolve, false);
      expect(requests.fetchExperience(runtime, { ...request }, { ...resolve }, false)).toBe(first);
      const nextRequest =
        changed === 'parameters'
          ? { ...request, parameters: { campaign: 'two' } }
          : changed === 'locale'
            ? { ...request, locale: 'de-DE' }
            : request;
      const nextResolve =
        changed === 'metadata'
          ? { ...resolve, metadata: { label: 'two' } }
          : changed === 'registry'
            ? { ...resolve, config: { components: {} } }
            : changed === 'debug'
              ? { ...resolve, debug: true }
              : resolve;
      await expect(
        requests.fetchExperience(runtime, nextRequest, nextResolve, false)
      ).resolves.toBe(plan);
      expect(runtime.fetchExperience).toHaveBeenCalledTimes(2);
      expect(runtime.fetchExperience).toHaveBeenLastCalledWith(nextRequest, nextResolve);
      pending.resolve(plan);
      await expect(first).resolves.toBe(plan);
    }
  );
  it('joins a pending explicit initial intent without rebuilding or replaying it', async () => {
    const pending = deferred<PortableRenderPlan>();
    vi.mocked(runtime.fetchExperience).mockReturnValueOnce(pending.promise);
    await render();
    const request = {
      experienceId: 'home',
      personalization: {
        events: [
          {
            type: 'track' as const,
            event: 'initial',
            properties: { at: new Date(0).toISOString() },
            channel: 'web' as const,
            messageId: 'initial',
            timestamp: '1970-01-01T00:00:00.000Z',
            originalTimestamp: '1970-01-01T00:00:00.000Z',
            sentAt: '1970-01-01T00:00:00.000Z',
            context: { campaign: {}, library: { name: 'test', version: '1' } },
          },
        ],
      },
    };
    const resolve = { config, metadata: { at: new Date(0) } };
    const first = requests.fetchExperience(runtime, request, resolve, false);
    expect(
      requests.fetchExperience(
        runtime,
        globalThis.structuredClone(request),
        { config, metadata: { at: new Date(0) } },
        false
      )
    ).toBe(first);
    await act(async () => {
      consent.value = true;
    });
    expect(runtime.fetchExperience).toHaveBeenCalledExactlyOnceWith(request, resolve);
    expect(runtime.trackCurrentPage).not.toHaveBeenCalled();
    pending.resolve(plan);
    await expect(first).resolves.toBe(plan);
  });
  it('retains the implicit consent-change page exception without refetching content', async () => {
    vi.mocked(runtime.hasConsent).mockReturnValue(true); // Default page allowlist.
    await render({ fetch: true });
    expect(runtime.trackCurrentPage).not.toHaveBeenCalled();
    await act(async () => {
      consent.value = true;
    });
    expect(runtime.trackCurrentPage).toHaveBeenCalledTimes(1);
    expect(runtime.fetchExperience).toHaveBeenCalledTimes(1);
    await act(async () => {
      consent.value = false;
      consent.value = true;
    });
    expect(runtime.trackCurrentPage).toHaveBeenCalledTimes(2);
    expect(runtime.fetchExperience).toHaveBeenCalledTimes(1);
  });
  it('lets XDA finish during the callback and delegates overlapping page attempts to Web', async () => {
    const { ContentfulExperiences: ActualSdk } = await import('@contentful/experiences-web');
    const sdk = new ActualSdk({
      spaceId: 'space',
      environmentId: 'master',
      delivery: { accessToken: 'delivery' },
      defaults: { profile: profileFixture('visitor'), consent: false, persistenceConsent: false },
    });
    runtime = sdk;
    const fetch = vi.spyOn(sdk, 'fetchExperience').mockResolvedValue(plan);
    const send = vi
      .spyOn(sdk.api.personalization, 'upsertProfile')
      .mockResolvedValue({ profile: profileFixture('visitor') } as never);
    const pending = deferred<void>();
    const run = vi.fn(async (client: Parameters<BeforeInitialPageOptions['run']>[0]) => {
      await pending.promise;
      await client.identify({ userId: 'visitor' });
    });
    try {
      await render({ beforeInitialPage: { run }, fetch: true });
      expect(fetch).toHaveBeenCalledOnce();
      await expect(fetch.mock.results[0]!.value).resolves.toBe(plan);
      await act(async () => sdk.consent({ events: true }));
      expect(send).not.toHaveBeenCalled();
      await act(async () => pending.resolve());
      expect(run).toHaveBeenCalledOnce();
      expect(
        send.mock.calls.flatMap(([request]) => request.events.map((event) => event.type))
      ).toEqual(['identify', 'page']);
      expect(fetch).toHaveBeenCalledOnce();
    } finally {
      await act(async () => view.cleanup());
      sdk.destroy();
      window.localStorage.clear();
    }
  });
  it('supersedes a pending optional callback when matching replay arrives', async () => {
    vi.useFakeTimers();
    const pending = deferred<void>();
    const beforeInitialPage = { run: vi.fn(() => pending.promise), onError: vi.fn() };
    await render({ beforeInitialPage });
    expect(vi.getTimerCount()).toBe(1);
    await render({
      beforeInitialPage,
      handoff: {
        spaceId: 'space',
        environmentId: 'master',
        cache: { scope: 'private-request' },
        replay: { routeKey: '/', events: [] },
      },
    });
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    await act(async () => pending.resolve());
    expect(beforeInitialPage.run).toHaveBeenCalledTimes(1);
    expect(beforeInitialPage.onError).not.toHaveBeenCalled();
    expect(runtime.trackCurrentPage).not.toHaveBeenCalled();
    await render({ beforeInitialPage, routeKey: '/next' });
    expect(beforeInitialPage.run).toHaveBeenCalledTimes(1);
    expect(runtime.trackCurrentPage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ routeKey: '/next' })
    );
  });
  it('joins callback work across Strict Mode and reaches its standalone page decision', async () => {
    vi.useFakeTimers();
    const pending = deferred<void>();
    const beforeInitialPage = { run: vi.fn(() => pending.promise) };
    await render({ beforeInitialPage, strict: true });
    expect(vi.getTimerCount()).toBe(1);
    await act(async () => pending.resolve());
    expect(beforeInitialPage.run).toHaveBeenCalledTimes(1);
    expect(runtime.trackCurrentPage).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['timeout', 'throw', 'invalid deadline'] as const)(
    'reports callback %s once and still reaches its page decision if reporting throws',
    async (failure) => {
      vi.useFakeTimers();
      const error = new Error('callback failed');
      const run = vi.fn(() => {
        if (failure === 'throw') throw error;
        return new Promise<void>(() => undefined);
      });
      const onError = vi.fn<(error: Error) => void>(() => {
        throw new Error('reporter failed');
      });
      await render({
        beforeInitialPage: { run, onError, maxWaitMs: failure === 'invalid deadline' ? 0 : 10 },
      });
      if (failure === 'timeout') {
        expect(runtime.trackCurrentPage).not.toHaveBeenCalled();
        await act(async () => vi.advanceTimersByTimeAsync(10));
      }
      expect(run).toHaveBeenCalledTimes(failure === 'invalid deadline' ? 0 : 1);
      expect(onError).toHaveBeenCalledOnce();
      expect(onError.mock.calls[0]![0]).toMatchObject({
        message:
          failure === 'throw'
            ? error.message
            : failure === 'timeout'
              ? 'beforeInitialPage.run timed out after 10 ms.'
              : 'beforeInitialPage.maxWaitMs must be a positive finite number.',
      });
      expect(runtime.trackCurrentPage).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    }
  );
  it('guards old callback clients and starts a fresh visitor callback after reset', async () => {
    const old = deferred<void>();
    const fresh = deferred<void>();
    const identify = vi.spyOn(runtime, 'identify').mockResolvedValue({ accepted: true });
    const track = vi.spyOn(runtime, 'track').mockResolvedValue({ accepted: true });
    let calls = 0;
    const beforeInitialPage: BeforeInitialPageOptions = {
      run: async (client) => {
        const first = calls++ === 0;
        await (first ? old.promise : fresh.promise);
        await client.identify({ userId: first ? 'old' : 'fresh' });
        await client.track({ event: first ? 'old' : 'fresh' });
      },
    };
    await render({ beforeInitialPage });
    await render({ beforeInitialPage, reset: {} });
    await act(async () => old.resolve());
    expect(identify).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
    expect(runtime.trackCurrentPage).not.toHaveBeenCalled();
    await act(async () => fresh.resolve());
    expect(identify).toHaveBeenCalledExactlyOnceWith({ userId: 'fresh' });
    expect(track).toHaveBeenCalledExactlyOnceWith({ event: 'fresh' });
    expect(runtime.trackCurrentPage).toHaveBeenCalledTimes(1);
  });
  it('reinvokes a standalone refused page on consent grant without any content fetch', async () => {
    vi.mocked(runtime.trackCurrentPage).mockResolvedValueOnce({ accepted: false });
    await render({ beforeInitialPage: { run: () => undefined } });
    expect(runtime.trackCurrentPage).toHaveBeenCalledTimes(1);
    await act(async () => {
      consent.value = true;
    });
    expect(runtime.trackCurrentPage).toHaveBeenCalledTimes(2);
    expect(runtime.fetchExperience).not.toHaveBeenCalled();
  });
  it('keeps contextual preview content live through event consent withdrawal and bypasses visitor callbacks', async () => {
    Object.defineProperty(runtime, 'isPreview', { value: true });
    consent.value = true;
    const pending = deferred<PortableRenderPlan>();
    vi.mocked(runtime.fetchExperience).mockReturnValueOnce(pending.promise);
    const beforeInitialPage = { run: vi.fn() };
    await render({ beforeInitialPage });
    const content = requests.fetchExperience(runtime, { experienceId: 'home' }, { config }, false);
    await Promise.resolve();
    await act(async () => {
      consent.value = false;
      signals.personalizationRequestState.value = { status: 'idle' };
    });
    pending.resolve(plan);
    await expect(content).resolves.toBe(plan);
    expect(beforeInitialPage.run).not.toHaveBeenCalled();
    expect(runtime.trackCurrentPage).not.toHaveBeenCalled();
  });
});
