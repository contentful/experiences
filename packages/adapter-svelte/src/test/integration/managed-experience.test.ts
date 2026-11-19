import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContentfulExperiences, type Config } from '@contentful/experiences-web';
import {
  ContentfulExperiences as Runtime,
  type ExperiencesHandoff,
  type PreviewClient,
} from '@contentful/experiences-runtime';
import { resolveExperience, type PortableRenderPlan } from '@contentful/experiences-sdk-core';
import type { ManagedExperience } from '../../experience/source-types.js';
import ManagedExperienceHarness from '../fixtures/ManagedExperienceHarness.svelte';
import ManagedOwnedHarness from '../fixtures/ManagedOwnedHarness.svelte';
import { componentNode } from '../fixtures/render-plan.js';
import { profile } from '../fixtures/runtime-profile.js';

const plan: PortableRenderPlan = {
  experienceId: 'primary',
  nodes: [],
  metadata: {},
  debug: false,
  diagnostics: [],
};
const owners: ContentfulExperiences[] = [];
const subscriptions: { unsubscribe(): void }[] = [];

function setup(profileId?: string, overrides: Partial<Config> = {}) {
  const blocked = vi.fn();
  const sdk = new ContentfulExperiences({
    spaceId: 'space',
    environmentId: 'environment',
    delivery: { accessToken: 'test' },
    defaults: {
      consent: false,
      persistenceConsent: false,
      profile: profileId ? profile(profileId) : undefined,
    },
    allowedEventTypes: [],
    onEventBlocked: blocked,
    ...overrides,
    autoTrackEntryInteraction: { views: false, hovers: false, clicks: false },
  });
  owners.push(sdk);
  // Keep the actual Web admission, state and queue owners; replace only their IO boundary.
  const fetch = vi.spyOn(Runtime.prototype, 'fetchExperience').mockResolvedValue(plan);
  const send = vi.spyOn(sdk.api.personalization, 'upsertProfile').mockResolvedValue({
    profile: profile('visitor'),
  } as never);
  const attempts: string[] = [];
  subscriptions.push(
    sdk.states.eventStream.subscribe((event) => {
      if (event) attempts.push(event.type);
    })
  );
  let current: ManagedExperience | undefined;
  const capture = (value: ManagedExperience) => {
    current = value;
  };
  return {
    sdk,
    fetch,
    send,
    blocked,
    attempts,
    capture,
    get current() {
      return current;
    },
  };
}

afterEach(() => {
  cleanup();
  for (const subscription of subscriptions.splice(0)) subscription.unsubscribe();
  for (const sdk of owners.splice(0)) sdk.destroy();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.history.replaceState({}, '', '/');
});

describe('mounted managed Experience with the Web event owner', () => {
  it('retains completed content across raw reset while ending pending work and old page intent', async () => {
    const state = setup();
    const resolved = vi.fn();
    const repeatedResolved = vi.fn();
    const view = render(ManagedExperienceHarness, {
      sdk: state.sdk,
      options: {
        experienceId: 'primary',
        onExperienceResolved: (current) => {
          resolved(current);
          if (resolved.mock.calls.length === 1) state.sdk.reset();
        },
      },
      secondary: { experienceId: 'primary', onExperienceResolved: repeatedResolved },
      capture: state.capture,
    });
    await waitFor(() => expect(state.current?.status).toBe('success'));
    const completed = state.current!.result;
    expect(resolved).toHaveBeenCalledOnce();
    expect(repeatedResolved).not.toHaveBeenCalled();
    expect(state.sdk.states.profile.current).toBeUndefined();
    state.sdk.reset();
    state.sdk.consent({ events: true });
    await state.sdk.flush();
    expect(state.current?.data).toBe(plan);
    expect(state.current?.result).toBe(completed);
    expect(state.fetch).toHaveBeenCalledOnce();
    expect(state.attempts).toEqual([]);
    expect(state.send).not.toHaveBeenCalled();
    expect(resolved).toHaveBeenCalledOnce();

    state.sdk.consent({ events: false });
    let finish!: (value: PortableRenderPlan) => void;
    state.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const refreshing = state.current!.refresh();
    await waitFor(() => expect(state.current?.status).toBe('loading'));
    state.sdk.reset();
    finish({ ...plan, metadata: { title: 'Canceled old response' } });
    await refreshing;
    expect(state.current?.status).toBe('success');
    expect(state.current?.data).toBe(plan);
    expect(state.current?.result).toBe(completed);
    expect(resolved).toHaveBeenCalledOnce();

    await state.current!.refresh();
    expect(state.fetch).toHaveBeenCalledTimes(3);
    expect(state.fetch.mock.calls[2]?.[0].personalization?.events).toBeUndefined();
    state.sdk.consent({ events: true });
    await state.sdk.flush();
    expect(state.attempts).toEqual([]);
    expect(state.send).not.toHaveBeenCalled();
    expect(resolved).toHaveBeenCalledOnce();
    await view.rerender({ routeKey: '/fresh-visit' });
    await waitFor(() => expect(state.fetch).toHaveBeenCalledTimes(4));
    expect(
      state.fetch.mock.calls[3]?.[0].personalization?.events?.map((event) => event.type)
    ).toEqual(['page']);
    expect(state.attempts).toEqual(['page']);
    expect(state.send).not.toHaveBeenCalled();
  });

  it('presents a successful XDA response together with its own changed profile identity', async () => {
    const state = setup('before');
    const personalized = { ...plan, personalization: { profile: profile('after') } };
    state.fetch.mockResolvedValue(personalized);
    render(ManagedExperienceHarness, {
      sdk: state.sdk,
      secondary: {},
      options: { experienceId: 'primary', personalization: { events: [] } },
      capture: state.capture,
    });
    await waitFor(() => expect(state.current?.status).toBe('success'));
    expect(state.sdk.states.profile.current?.id).toBe('after');
    expect(state.current?.data).toBe(personalized);
    expect(state.current?.result?.plan).toBe(personalized);
    expect(state.fetch).toHaveBeenCalledOnce();
    expect(state.attempts).toEqual([]);
  });

  it('shares runtime Preview updates and isolates old content when the committed session changes', async () => {
    window.history.replaceState({}, '', '/managed?preview_session_id=first');
    const connections: {
      publish(result: ReturnType<PreviewClient['getResult']>): void;
      stop: ReturnType<typeof vi.fn>;
    }[] = [];
    const createClient = vi.fn((): PreviewClient => {
      let value: ReturnType<PreviewClient['getResult']> = { data: undefined, error: undefined };
      let update = () => {};
      const stop = vi.fn();
      connections.push({
        stop,
        publish(result) {
          value = result;
          update();
        },
      });
      return {
        getResult: () => value,
        subscribe(next) {
          update = next;
          return stop;
        },
        subscribeStatus(next) {
          next('live');
          return () => {};
        },
      };
    });
    const snapshot = vi.fn(
      async () =>
        new globalThis.Response(
          JSON.stringify({
            sys: { id: 'primary', type: 'Experience' },
            nodes: [],
          })
        )
    );
    let current: ManagedExperience | undefined;
    const view = render(ManagedOwnedHarness, {
      config: {
        spaceId: 'space',
        environmentId: 'master',
        delivery: { accessToken: 'test' },
        preview: { accessToken: 'preview', fetch: snapshot, createClient, maxRetries: 0 },
        autoTrackEntryInteraction: { views: false, hovers: false, clicks: false },
      },
      options: { experienceId: 'primary' },
      routeKey: '/managed?preview_session_id=first',
      capture(value) {
        current = value;
      },
    });
    await waitFor(() => expect(current?.status).toBe('success'));
    expect(createClient).toHaveBeenCalledOnce();
    expect(snapshot).toHaveBeenCalledOnce();
    const first = current!.data;
    connections[0]!.publish({
      data: {
        sys: { id: 'other', type: 'Experience' },
        nodes: [componentNode('heading')],
      },
      error: undefined,
    });
    await waitFor(() => expect(current?.data).toBe(first));
    const livePayload = {
      sys: { id: 'primary', type: 'Experience' as const },
      nodes: [componentNode('heading')],
    };
    connections[0]!.publish({ data: livePayload, error: undefined });
    await waitFor(() => expect(current?.data?.nodes).toHaveLength(1));
    const usable = current!.data;
    connections[0]!.publish({ data: livePayload, error: new Error('socket interrupted') });
    await waitFor(() => expect(current?.error?.message).toBe('socket interrupted'));
    expect(current?.data).toBe(usable);

    window.history.replaceState({}, '', '/managed?preview_session_id=second');
    await view.rerender({ routeKey: '/managed?preview_session_id=second' });
    await waitFor(() => expect(current?.status).toBe('success'));
    expect(createClient).toHaveBeenCalledTimes(2);
    expect(connections[0]!.stop).toHaveBeenCalledOnce();
    expect(current?.data?.nodes).toHaveLength(0);
    const next = current!.data;
    connections[0]!.publish({
      data: {
        sys: { id: 'primary', type: 'Experience' },
        nodes: [componentNode('heading')],
      },
      error: undefined,
    });
    expect(current?.data).toBe(next);
    view.unmount();
    expect(connections[1]!.stop).toHaveBeenCalledOnce();
  });

  it('shares the primary across presentations and retries only a refused page on consent grant', async () => {
    const state = setup();
    const view = render(ManagedExperienceHarness, {
      sdk: state.sdk,
      secondary: {},
      options: {
        experienceId: 'primary',
        personalization: { events: [{ type: 'track', event: 'blocked' }, { type: 'page' }] },
      },
      capture: state.capture,
    });
    await waitFor(() => expect(state.current?.status).toBe('success'));
    expect(state.fetch).toHaveBeenCalledOnce();
    expect(state.attempts).toEqual([]);
    expect(state.send).not.toHaveBeenCalled();
    expect(state.blocked).toHaveBeenCalled();

    state.sdk.consent({ events: false });
    state.sdk.consent({ events: true });
    await waitFor(() => expect(state.send).toHaveBeenCalledOnce());
    expect(state.attempts).toEqual(['page']);
    expect(state.send.mock.calls[0]?.[0].events.map((event) => event.type)).toEqual(['page']);
    expect(state.fetch).toHaveBeenCalledOnce();

    await view.rerender({ secondary: undefined });
    expect(state.current?.data).toBe(plan);
    await state.current!.retry();
    await state.current!.refresh();
    expect(state.fetch).toHaveBeenCalledTimes(3);
    for (const [request] of state.fetch.mock.calls) {
      expect(request.personalization?.events ?? []).toEqual([]);
    }
    expect(state.attempts).toEqual(['page']);
    expect(state.send).toHaveBeenCalledOnce();
  });

  it.each([false, true])(
    'keeps hybrid content and permits only current page retry after raw reset=%s',
    async (reset) => {
      const state = setup();
      const handoff: ExperiencesHandoff = {
        spaceId: 'space',
        environmentId: 'environment',
        cache: { scope: 'private-request' },
        profileId: 'visitor',
        replay: {
          routeKey: '/managed',
          events: [
            state.sdk.eventBuilder.buildTrack({ event: 'blocked' }),
            state.sdk.eventBuilder.buildPageView(),
          ],
        },
      };
      render(ManagedExperienceHarness, {
        sdk: state.sdk,
        secondary: {},
        options: { experienceId: 'primary', initialPlan: plan },
        handoff,
        capture: state.capture,
      });
      await waitFor(() =>
        expect(state.sdk.states.personalizationRequestState.current.status).toBe('success')
      );
      expect(state.current?.data).toBe(plan);
      expect(state.fetch).not.toHaveBeenCalled();
      expect(state.attempts).toEqual([]);
      expect(state.send).not.toHaveBeenCalled();

      const completed = state.current?.result;
      if (reset) state.sdk.reset();
      state.sdk.consent({ events: true });
      if (!reset) await waitFor(() => expect(state.send).toHaveBeenCalledOnce());
      expect(state.fetch).not.toHaveBeenCalled();
      await state.sdk.flush();
      expect(state.current?.data).toBe(plan);
      expect(state.current?.result).toBe(completed);
      expect(state.attempts).toEqual(reset ? [] : ['page']);
      expect(state.send).toHaveBeenCalledTimes(reset ? 0 : 1);
      if (!reset)
        expect(state.send.mock.calls[0]?.[0].events.map((event) => event.type)).toEqual(['page']);
    }
  );

  it.each([false, true])(
    'permits fresh same-route content after host redirect policy throws=%s',
    async (throws) => {
      const state = setup();
      state.fetch.mockResolvedValueOnce({ redirect: { path: '/next' } });
      const onRedirect = vi.fn(() => {
        if (throws) throw new Error('navigation failed');
      });
      const view = render(ManagedExperienceHarness, {
        sdk: state.sdk,
        options: { destinationId: 'dest', path: '/' },
        secondary: { destinationId: 'dest', path: '/' },
        onRedirect,
        capture: state.capture,
      });
      await waitFor(() => expect(state.current?.status).toBe(throws ? 'error' : 'redirect'));
      if (throws) expect(view.getByText('Application error')).toBeTruthy();
      expect(view.queryByText('navigation failed')).toBeNull();
      state.sdk.consent({ events: true });
      await state.sdk.flush();
      expect(state.attempts).toEqual([]);
      if (throws) await state.current!.retry();
      else
        await view.rerender({
          secondary: undefined,
          options: { experienceId: 'fresh-selection' },
        });
      await waitFor(() => expect(state.current?.data).toBe(plan));
      expect(state.attempts).toEqual([]);
      expect(onRedirect).toHaveBeenCalledOnce();
    }
  );

  it('retains the exact interactive presentation through acquisition failure and recovers on event-free refresh', async () => {
    const state = setup();
    const interactive = {
      ...(await resolveExperience({ nodes: [componentNode('counter')] }, { components: {} })),
      experienceId: 'primary',
    };
    state.fetch.mockResolvedValue(interactive);
    const view = render(ManagedExperienceHarness, {
      sdk: state.sdk,
      options: { experienceId: 'primary' },
      capture: state.capture,
    });
    const button = await view.findByRole('button', { name: 'Retained count 0' });
    await fireEvent.click(button);
    expect(button.textContent).toBe('Retained count 1');
    const failure = new TypeError('Failed to fetch');
    state.fetch.mockRejectedValueOnce(failure);
    await state.current!.refresh();
    await waitFor(() => expect(state.current?.error).toBe(failure));
    expect(state.current?.status).toBe('error');
    expect(state.current?.data).toBe(interactive);
    expect(state.current?.result?.error).toBe(failure);
    expect(state.current?.result?.plan).toBeUndefined();
    expect(view.getByRole('button')).toBe(button);
    expect(button.textContent).toBe('Retained count 1');
    expect(view.queryByText('Application error')).toBeNull();
    await state.current!.refresh();
    await waitFor(() => expect(state.current?.status).toBe('success'));
    expect(state.current?.error).toBeUndefined();
    expect(state.current?.result?.plan).toBe(interactive);
    expect(view.getByRole('button')).toBe(button);
    expect(button.textContent).toBe('Retained count 1');
    for (const [request] of state.fetch.mock.calls.slice(1))
      expect(request.personalization?.events).toBeUndefined();
    expect(state.attempts).toEqual([]);
  });

  it.each([401, 404])(
    'renders the app baseline for a seeded HTTP %s without private error text',
    async (statusCode) => {
      const state = setup();
      const error = Object.assign(new Error('private server detail'), { statusCode });
      const view = render(ManagedExperienceHarness, {
        sdk: state.sdk,
        options: { experienceId: 'primary', initialError: error },
        capture: state.capture,
      });
      expect(
        view.getByText(statusCode === 404 ? 'Application content missing' : 'Application error')
      ).toBeTruthy();
      expect(view.queryByText(error.message)).toBeNull();
      expect(state.current?.data).toBeUndefined();
      expect(state.fetch).not.toHaveBeenCalled();
    }
  );

  it('finishes snapshot-only Preview loading across an explicit consent denial without a socket rescue or events', async () => {
    window.history.replaceState({}, '', '/managed?preview_session_id=snapshot');
    let finish!: (value: globalThis.Response) => void;
    const snapshot = vi.fn(
      () =>
        new Promise<globalThis.Response>((resolve) => {
          finish = resolve;
        })
    );
    const state = setup(undefined, {
      preview: { accessToken: 'preview', fetch: snapshot, maxRetries: 0 },
    });
    state.fetch.mockRestore();
    const view = render(ManagedExperienceHarness, {
      sdk: state.sdk,
      options: { experienceId: 'primary' },
      capture: state.capture,
    });
    await waitFor(() => expect(snapshot).toHaveBeenCalledOnce());
    expect(state.current?.status).toBe('loading');
    state.sdk.consent({ events: false });
    finish(
      new globalThis.Response(
        JSON.stringify({
          sys: { id: 'primary', type: 'Experience' },
          nodes: [componentNode('heading', { contentProperties: { text: 'Snapshot content' } })],
        })
      )
    );
    await waitFor(() => expect(view.getByRole('heading').textContent).toBe('Snapshot content'));
    expect(state.current?.status).toBe('success');
    const usable = state.current?.data;
    state.sdk.consent({ events: true });
    await state.sdk.flush();
    expect(state.current?.data).toBe(usable);
    expect(snapshot).toHaveBeenCalledOnce();
    expect(state.attempts).toEqual([]);
    expect(state.send).not.toHaveBeenCalled();
  });

  it('presents a Preview snapshot 404 as an application error rather than missing Delivery content', async () => {
    window.history.replaceState({}, '', '/managed?preview_session_id=unavailable');
    const snapshot = vi.fn(async () => new globalThis.Response('{}', { status: 404 }));
    const state = setup(undefined, {
      preview: { accessToken: 'preview', fetch: snapshot, maxRetries: 0 },
    });
    state.fetch.mockRestore();
    const view = render(ManagedExperienceHarness, {
      sdk: state.sdk,
      options: { experienceId: 'primary' },
      capture: state.capture,
    });
    await waitFor(() => expect(view.getByText('Application error')).toBeTruthy());
    expect(state.current?.result?.notFound).toBeUndefined();
    expect(state.current?.result?.error).toBeDefined();
    expect(view.queryByText('Application content missing')).toBeNull();
    expect(state.attempts).toEqual([]);
    expect(state.send).not.toHaveBeenCalled();
  });

  it('detaches root consent retry without destroying the caller-owned Web runtime', async () => {
    const state = setup();
    const destroy = vi.spyOn(state.sdk, 'destroy');
    const view = render(ManagedExperienceHarness, {
      sdk: state.sdk,
      secondary: {},
      options: { experienceId: 'primary' },
      capture: state.capture,
    });
    await waitFor(() => expect(state.current?.status).toBe('success'));
    view.unmount();
    state.sdk.consent({ events: true });
    await state.sdk.flush();
    expect(state.attempts).toEqual([]);
    expect(state.send).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
  });
});
