'use client';

// Adapted from OptimizationRoot/OptimizationPageSequence and useAutoPageEmitter
// at f76f1ff04df1b466c98fc6ce5db6b569f9212438 (MIT). XDA carries ordinary
// initialization intent with content; only explicit replay/page operations commit.
import { useEffect, useMemo, useRef, type PropsWithChildren } from 'react';
import type {
  ContentfulExperiences,
  CurrentPageOptions,
  ExperiencesHandoff,
  WebExperiencesRuntime,
} from '@contentful/experiences-web';
import type { FetchExperienceOptions, FetchResolveOptions } from '@contentful/experiences-runtime';
import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';
import { useRuntimeContext } from './context.js';
import { RequestContext } from './request-context.js';
import { sameValue } from '../experience/source-controller.js';

export interface BeforeInitialPageOptions {
  readonly run: (
    client: Readonly<Pick<WebExperiencesRuntime, 'identify' | 'track'>>
  ) => void | PromiseLike<unknown>;
  readonly maxWaitMs?: number;
  readonly onError?: (error: Error) => void;
}

/** One route/page intent; content freshness and event admission belong to their owners. */
export function PageSequence({
  children,
  routeKey,
  buildPagePayload,
  beforeInitialPage,
  pageMode,
  handoff,
  resetRevision,
  onReset,
}: PropsWithChildren<{
  routeKey: string;
  buildPagePayload?: CurrentPageOptions['buildPayload'];
  beforeInitialPage?: BeforeInitialPageOptions;
  pageMode?: 'analytics';
  handoff?: ExperiencesHandoff;
  resetRevision: object;
  onReset: () => void;
}>) {
  const { sdk, isLive } = useRuntimeContext();
  const latest = useRef({
    buildPagePayload,
    beforeInitialPage,
    matchingHandoff: handoff?.replay?.routeKey === routeKey,
  });
  latest.current = {
    buildPagePayload,
    beforeInitialPage,
    matchingHandoff: handoff?.replay?.routeKey === routeKey,
  };
  const owner = useMemo(
    () => ({
      initialEmission: true,
      callbackStarted: false,
      callback: Promise.resolve(),
    }),
    [sdk, resetRevision]
  );
  const matchingHandoff = handoff?.replay?.routeKey === routeKey;
  const requestContext = useMemo(() => {
    let initialStarted = false;
    let pageIntent = false;
    let pending:
      | {
          request: FetchExperienceOptions;
          resolve: FetchResolveOptions;
          promise: Promise<PortableRenderPlan>;
        }
      | undefined;
    return {
      revision: {},
      get pageIntent() {
        return pageIntent;
      },
      reset: onReset,
      fetchExperience(
        runtime: ContentfulExperiences,
        request: FetchExperienceOptions,
        resolve: FetchResolveOptions,
        isRefresh: boolean
      ): Promise<PortableRenderPlan> {
        // One supported Experience per page. Only its pending initial intent joins;
        // Retry and application comparison requests have no cross-fetch contract.
        if (
          !isRefresh &&
          pending &&
          sameValue(pending.request, request) &&
          pending.resolve.config === resolve.config &&
          sameValue(pending.resolve.metadata ?? {}, resolve.metadata ?? {}) &&
          (pending.resolve.debug ?? false) === (resolve.debug ?? false)
        )
          return pending.promise;
        let options = request;
        const isInitial = !isRefresh && !initialStarted;
        if (isInitial) {
          initialStarted = true;
          if (
            !runtime.isPreview &&
            !latest.current.matchingHandoff &&
            request.personalization?.events === undefined
          ) {
            const payload = latest.current.buildPagePayload?.({
              isInitialEmission: owner.initialEmission,
            });
            if (payload !== undefined)
              options = {
                ...request,
                personalization: {
                  ...request.personalization,
                  events: [{ type: 'page', ...payload }],
                },
              };
          }
        }
        if (!isRefresh && options.personalization?.events?.some((event) => event.type === 'page')) {
          owner.initialEmission = false;
          pageIntent = true;
        }
        const promise = runtime.fetchExperience(options, resolve);
        if (isInitial) {
          pending = { request, resolve, promise };
          void promise
            .finally(() => {
              if (pending?.promise === promise) pending = undefined;
            })
            .catch(() => undefined);
        }
        return promise;
      },
    };
  }, [sdk, routeKey, resetRevision, onReset, owner]);

  // Optional app callback authority lasts until completion, matching handoff,
  // reset, owner replacement or unmount. It never gates XDA content.
  useEffect(() => {
    const options = latest.current.beforeInitialPage;
    if (!isLive || sdk.isPreview || !options || matchingHandoff || owner.callbackStarted) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let finish!: () => void;
    owner.callback = new Promise<void>((resolve) => {
      finish = resolve;
    });
    void Promise.resolve().then(async () => {
      // Defer app work so Strict Mode's discarded connection never invokes it.
      if (!active) return;
      owner.callbackStarted = true;
      try {
        const maxWaitMs = options.maxWaitMs ?? 3000;
        if (!Number.isFinite(maxWaitMs) || maxWaitMs <= 0)
          throw new TypeError('beforeInitialPage.maxWaitMs must be a positive finite number.');
        await Promise.race([
          Promise.resolve(
            options.run({
              identify: (...args) =>
                active ? sdk.identify(...args) : Promise.resolve({ accepted: false }),
              track: (...args) =>
                active ? sdk.track(...args) : Promise.resolve({ accepted: false }),
            })
          ),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error(`beforeInitialPage.run timed out after ${maxWaitMs} ms.`)),
              maxWaitMs
            );
          }),
          owner.callback,
        ]);
      } catch (cause) {
        if (active) {
          try {
            options.onError?.(cause instanceof Error ? cause : new Error(String(cause)));
          } catch {
            /* Reporting must not prevent the page decision. */
          }
        }
      } finally {
        active = false;
        clearTimeout(timer);
        finish();
      }
    });
    return () => {
      active = false;
      clearTimeout(timer);
      finish();
    };
  }, [isLive, sdk, owner, matchingHandoff]);

  useEffect(() => {
    if (!isLive || sdk.isPreview || handoff) return;
    let disposed = false;
    const isCurrent = () => !disposed;
    const emitPage = () => {
      void owner.callback
        .then(() => {
          if (!isCurrent()) return;
          return sdk.trackCurrentPage({
            routeKey,
            buildPayload: latest.current.buildPagePayload ?? (() => ({})),
            isCurrent,
          });
        })
        .catch(() => undefined);
    };
    let previous = sdk.states.consent.current;
    const subscription = sdk.states.consent.subscribe((consent) => {
      const granted = consent === true && previous !== true;
      previous = consent;
      if (
        granted &&
        (pageMode === 'analytics' ||
          requestContext.pageIntent ||
          (latest.current.beforeInitialPage && latest.current.buildPagePayload))
      )
        emitPage();
    });
    if (
      pageMode === 'analytics' ||
      (latest.current.beforeInitialPage && latest.current.buildPagePayload)
    ) {
      emitPage();
    }
    return () => {
      disposed = true;
      subscription.unsubscribe();
    };
  }, [isLive, sdk, routeKey, handoff, requestContext, owner, pageMode]);

  return <RequestContext.Provider value={requestContext}>{children}</RequestContext.Provider>;
}
