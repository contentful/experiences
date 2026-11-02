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
  it('rejects an old route result while retaining the same child and runtime', async () => {
    const pending = deferred<PortableRenderPlan>();
    vi.mocked(runtime.fetchExperience).mockReturnValueOnce(pending.promise);
    await render();
    const child = view.container.querySelector('span');
    const old = requests.fetchExperience(runtime, { experienceId: 'home' }, { config }, false);
    const rejection = expect(old).rejects.toThrow('superseded');
    await Promise.resolve();
    await render({ routeKey: '/page-two' });
    pending.resolve(plan);
    await rejection;
    expect(view.container.querySelector('span')).toBe(child);
    await requests.fetchExperience(runtime, { experienceId: 'two' }, { config }, false);
    expect(runtime.fetchExperience).toHaveBeenLastCalledWith(
      expect.objectContaining({
        personalization: { events: [{ type: 'page', properties: { route: '/page-two' } }] },
      }),
      { config }
    );
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
  it.each([false, true])(
    'defers a consent-triggered page until the optional callback settles without gating XDA (managed=%s)',
    async (fetch) => {
      const pending = deferred<void>();
      const order: string[] = [];
      vi.spyOn(runtime, 'identify').mockImplementation(async () => {
        order.push('identify');
        return { accepted: true };
      });
      vi.mocked(runtime.trackCurrentPage).mockImplementation(async () => {
        order.push('page');
        return { accepted: true };
      });
      const beforeInitialPage: BeforeInitialPageOptions = {
        run: async (client) => {
          order.push('callback-start');
          await pending.promise;
          await client.identify({ userId: 'visitor' });
          order.push('callback-end');
        },
      };
      await render({ beforeInitialPage, fetch });
      if (fetch) {
        expect(runtime.fetchExperience).toHaveBeenCalledExactlyOnceWith(
          {
            experienceId: 'home',
            personalization: { events: [{ type: 'page', properties: { route: '/' } }] },
          },
          { config }
        );
        await expect(vi.mocked(runtime.fetchExperience).mock.results[0]!.value).resolves.toBe(plan);
      } else expect(runtime.fetchExperience).not.toHaveBeenCalled();
      await act(async () => {
        consent.value = true;
      });
      expect(order).toEqual(['callback-start']);
      expect(runtime.trackCurrentPage).not.toHaveBeenCalled();
      await act(async () => pending.resolve());
      expect(order).toEqual(['callback-start', 'identify', 'callback-end', 'page']);
      expect(runtime.trackCurrentPage).toHaveBeenCalledTimes(1);
      expect(runtime.fetchExperience).toHaveBeenCalledTimes(fetch ? 1 : 0);
    }
  );
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
  it('joins only in-flight initialization, never a settled previous visitor plan', async () => {
    await render();
    await requests.fetchExperience(runtime, { experienceId: 'home' }, { config }, false);
    await requests.fetchExperience(runtime, { experienceId: 'home' }, { config }, false);
    expect(runtime.fetchExperience).toHaveBeenCalledTimes(2);
    const pending = deferred<PortableRenderPlan>();
    vi.mocked(runtime.fetchExperience).mockReturnValueOnce(pending.promise);
    const old = requests.fetchExperience(runtime, { experienceId: 'home' }, { config }, false);
    const rejected = expect(old).rejects.toThrow('superseded');
    await Promise.resolve();
    signals.personalizationRequestState.value = { status: 'idle' }; // Direct SDK reset/purge.
    const fresh = requests.fetchExperience(runtime, { experienceId: 'home' }, { config }, false);
    pending.resolve(plan);
    await rejected;
    await fresh;
    expect(runtime.fetchExperience).toHaveBeenCalledTimes(4);
  });
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
  it('preserves page intent after withdrawal cancels a pending initial callback', async () => {
    consent.value = true;
    const pending = deferred<void>();
    const beforeInitialPage = { run: vi.fn(() => pending.promise) };
    await render({ beforeInitialPage });
    await act(async () => {
      consent.value = false;
      signals.personalizationRequestState.value = { status: 'idle' };
    });
    expect(runtime.trackCurrentPage).not.toHaveBeenCalled();
    await act(async () => {
      consent.value = true;
    });
    expect(runtime.trackCurrentPage).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve());
    expect(runtime.trackCurrentPage).toHaveBeenCalledTimes(1);
    expect(beforeInitialPage.run).toHaveBeenCalledTimes(1);
  });
});
