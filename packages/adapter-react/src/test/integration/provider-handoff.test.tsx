/** @vitest-environment jsdom */
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ContentfulExperiences,
  type Config,
  type ExperiencesHandoff,
  type PersonalizationState,
  type States,
} from '@contentful/experiences-web';
import { EventBuilder } from '@contentful/experiences-runtime';
import { ExperiencesProvider } from '../../runtime/experiences-provider.js';
import { useRuntimeContext, type RuntimeContextValue } from '../../runtime/context.js';
import { createDomTestRoot, type DomTestRoot } from '../dom-root.js';
import { profileFixture } from '../fixtures/profile.js';

const config: Config = {
  spaceId: 'space',
  environmentId: 'master',
  delivery: { accessToken: 'delivery' },
};
function handoff(id = 'server-profile'): ExperiencesHandoff {
  return {
    spaceId: 'space',
    environmentId: 'master',
    cache: { scope: 'private-request' },
    state: { profile: profileFixture(id) },
  };
}
function deferred() {
  let resolve!: (result?: { accepted: boolean }) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<{ accepted: boolean }>((yes, no) => {
    resolve = (result = { accepted: true }) => yes(result);
    reject = no;
  });
  return { promise, resolve, reject };
}
describe('React provider and Web SDK handoff integration', () => {
  let view: DomTestRoot;
  let browser: ContentfulExperiences | undefined;
  let captures: RuntimeContextValue[];
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    window.history.replaceState(null, '', '/initial');
    view = createDomTestRoot();
    captures = [];
  });
  afterEach(() => {
    act(() => view.cleanup());
    browser?.destroy();
    browser = undefined;
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  function Probe() {
    const context = useRuntimeContext();
    captures.push(context);
    return <output>{context.sdk.states.profile.current?.id}</output>;
  }
  const current = () => captures.at(-1)!;
  function suppliedContent() {
    return (
      <>
        <article>Supplied server content</article>
        <Probe />
      </>
    );
  }
  it.each(['static', 'builder'] as const)(
    'uses %s arguments for the fresh page after consent grants a denied page-bearing handoff',
    async (kind) => {
      browser = new ContentfulExperiences({
        ...config,
        allowedEventTypes: [],
        defaults: {
          profile: profileFixture('browser-profile'),
          consent: false,
          persistenceConsent: false,
        },
      });
      const sdk = browser;
      const send = vi.spyOn(sdk.api.personalization, 'upsertProfile').mockResolvedValue({
        profile: profileFixture('browser-profile'),
      } as never);
      const consume = vi.spyOn(sdk, 'hydrateAndTrackCurrentPage');
      const builder = new EventBuilder({
        channel: 'server',
        library: { name: 'react-test', version: '1' },
        getConsent: () => true,
      });
      const events = [builder.buildTrack({ event: 'prepared' }), builder.buildPageView()];
      const suppliedHandoff: ExperiencesHandoff = {
        ...handoff(),
        replay: { routeKey: '/initial', events },
      };
      const initialPagePayload = { properties: { source: 'static' } };
      const buildPagePayload =
        kind === 'builder' ? () => ({ properties: { source: 'builder' } }) : undefined;
      await act(async () =>
        view.render(
          <ExperiencesProvider
            sdk={sdk}
            handoff={suppliedHandoff}
            initialPagePayload={initialPagePayload}
            buildPagePayload={buildPagePayload}
          >
            {suppliedContent()}
          </ExperiencesProvider>
        )
      );
      expect(await consume.mock.results[0]!.value).toMatchObject({ accepted: false });
      expect(current()).toMatchObject({ sdk, isLive: true, isContentReady: true });
      expect(send).not.toHaveBeenCalled();
      expect(sdk.states.eventStream.current).toBeUndefined();
      const settledRenderCount = captures.length;
      await act(async () => {
        sdk.consent({ events: true });
        await consume.mock.results[1]!.value;
        await sdk.flush();
      });
      expect(consume).toHaveBeenCalledTimes(2);
      expect(send).toHaveBeenCalledOnce();
      const sent = send.mock.calls[0]![0].events;
      expect(sent.map((event) => event.type)).toEqual(['page']);
      expect(sent[0]).toMatchObject({ properties: { source: kind } });
      expect(events.map((event) => event.messageId)).not.toContain(sent[0]!.messageId);
      expect(sent[0]!.context.gdpr?.isConsentGiven).toBe(true);
      expect(captures.slice(settledRenderCount).every((state) => state.isContentReady)).toBe(true);
      expect(current()).toMatchObject({
        sdk,
        isLive: true,
        isContentReady: true,
        error: undefined,
      });
      expect(view.container.textContent).toContain('Supplied server content');
    }
  );

  it.each(['remove handoff', 'unmount'] as const)(
    'prevents late state and replay admission on %s while the injected SDK stays alive',
    async (action) => {
      browser = new ContentfulExperiences({
        ...config,
        defaults: {
          profile: profileFixture('browser-profile'),
          consent: true,
          persistenceConsent: false,
        },
      });
      const sdk = browser;
      const send = vi.spyOn(sdk.api.personalization, 'upsertProfile').mockResolvedValue({
        profile: profileFixture('browser-profile'),
      } as never);
      const destroy = vi.spyOn(sdk, 'destroy');
      const consume = vi.spyOn(sdk, 'hydrateAndTrackCurrentPage');
      const started = deferred();
      const release = deferred();
      const stateInterceptor = vi.fn(async (state: PersonalizationState) => {
        started.resolve();
        await release.promise;
        return state;
      });
      sdk.interceptors.state.add(stateInterceptor);
      const events = [sdk.eventBuilder.buildPageView()];
      const suppliedHandoff: ExperiencesHandoff = {
        ...handoff(),
        replay: { routeKey: '/initial', events },
      };
      const publishedState = vi.fn();
      const publishedEvent = vi.fn();
      const onStatesReady = vi.fn((states: States) => {
        const state = states.profile.subscribe(publishedState);
        const event = states.eventStream.subscribe(publishedEvent);
        return () => {
          state.unsubscribe();
          event.unsubscribe();
        };
      });
      const tree = (handoff?: ExperiencesHandoff) => (
        <ExperiencesProvider sdk={sdk} handoff={handoff} onStatesReady={onStatesReady}>
          <Probe />
        </ExperiencesProvider>
      );
      await act(async () => {
        view.render(tree(suppliedHandoff));
      });
      await started.promise;
      expect(stateInterceptor).toHaveBeenCalledOnce();
      expect(current().isContentReady).toBe(false);
      const isCurrent = consume.mock.calls[0]![1].isCurrent!;
      act(() => {
        if (action === 'remove handoff') view.render(tree());
        else view.cleanup();
      });
      expect(isCurrent()).toBe(false);
      const renderCount = captures.length;
      await act(async () => {
        release.resolve();
        expect(await consume.mock.results[0]!.value).toMatchObject({ accepted: false });
      });
      expect(destroy).not.toHaveBeenCalled();
      expect(captures).toHaveLength(renderCount);
      expect(sdk.states.profile.current).toEqual(profileFixture('browser-profile'));
      expect(sdk.states.personalizationRequestState.current).toEqual({ status: 'idle' });
      expect(sdk.states.eventStream.current).toBeUndefined();
      expect(publishedState).toHaveBeenCalledExactlyOnceWith(profileFixture('browser-profile'));
      expect(publishedEvent).toHaveBeenCalledExactlyOnceWith(undefined);
      expect(send).not.toHaveBeenCalled();
      act(() => sdk.consent({ events: false }));
      expect(sdk.states.consent.current).toBe(false);
      expect(consume).toHaveBeenCalledOnce();
      if (action === 'remove handoff')
        expect(current()).toMatchObject({ sdk, isLive: true, isContentReady: true });
    }
  );
});
