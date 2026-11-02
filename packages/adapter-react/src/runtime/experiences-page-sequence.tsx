'use client';

// Adapted from OptimizationRoot/OptimizationPageSequence and useAutoPageEmitter
// at f76f1ff04df1b466c98fc6ce5db6b569f9212438 (MIT). XDA carries ordinary
// initialization intent with content; only explicit replay/page operations commit.
import { useEffect, useLayoutEffect, useMemo, useRef, type PropsWithChildren } from 'react';
import type {
  ContentfulExperiences,
  CurrentPageOptions,
  ExperiencesHandoff,
  WebExperiencesRuntime,
} from '@contentful/experiences-web';
import type {
  RuntimeFetchExperienceOptions,
  RuntimeFetchResolveOptions,
} from '@contentful/experiences-runtime';
import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';
import { useExperiencesContext } from './experiences-context.js';
import { ExperienceRequestContext } from './experience-request-context.js';

export interface BeforeInitialPageOptions {
  readonly run: (
    client: Readonly<Pick<WebExperiencesRuntime, 'identify' | 'track'>>
  ) => void | PromiseLike<unknown>;
  readonly maxWaitMs?: number;
  readonly onError?: (error: Error) => void;
}

function createInitialPageCallback(runtime: ContentfulExperiences, resetRevision: object) {
  let cancelled = false;
  let pending = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stop!: () => void;
  const stopped = new Promise<void>((resolve) => {
    stop = resolve;
  });
  return {
    runtime,
    resetRevision,
    promise: Promise.resolve(),
    get pending() {
      return pending;
    },
    cancel() {
      cancelled = true;
      pending = false;
      clearTimeout(timer);
      stop();
    },
    async run(options: BeforeInitialPageOptions, isCurrent: () => boolean) {
      const isLive = () => !cancelled && isCurrent();
      const maxWaitMs = options.maxWaitMs ?? 3000;
      try {
        if (!Number.isFinite(maxWaitMs) || maxWaitMs <= 0)
          throw new TypeError('beforeInitialPage.maxWaitMs must be a positive finite number.');
        const deadline = new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`beforeInitialPage.run timed out after ${maxWaitMs} ms.`)),
            maxWaitMs
          );
        });
        await Promise.race([
          Promise.resolve(
            options.run({
              identify: (...args) =>
                isLive() ? runtime.identify(...args) : Promise.resolve({ accepted: false }),
              track: (...args) =>
                isLive() ? runtime.track(...args) : Promise.resolve({ accepted: false }),
            })
          ),
          deadline,
          stopped,
        ]);
      } catch (cause) {
        if (!cancelled) {
          try {
            options.onError?.(cause instanceof Error ? cause : new Error(String(cause)));
          } catch {
            /* Reporting does not prevent terminal readiness. */
          }
        }
      } finally {
        pending = false;
        clearTimeout(timer);
      }
    },
  };
}

function sourceKey(request: RuntimeFetchExperienceOptions, resolve: RuntimeFetchResolveOptions) {
  try {
    const normalize = (value: unknown): unknown => {
      if (value === undefined || value === null || typeof value !== 'object') {
        if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint')
          throw new TypeError('Opaque request');
        return value;
      }
      if (Array.isArray(value)) return value.map(normalize);
      if (Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError('Opaque request');
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, normalize(item)])
      );
    };
    return JSON.stringify(normalize([request, resolve.metadata, resolve.debug]));
  } catch {
    return undefined;
  }
}

/** One route's initialization joins; this is not a per-resource content cache. */
export function ExperiencesPageSequence({
  children,
  routeKey,
  buildPagePayload,
  beforeInitialPage,
  handoff,
  resetRevision,
  onReset,
}: PropsWithChildren<{
  routeKey: string;
  buildPagePayload?: CurrentPageOptions['buildPayload'];
  beforeInitialPage?: BeforeInitialPageOptions;
  handoff?: ExperiencesHandoff;
  resetRevision: object;
  onReset: () => void;
}>) {
  const { sdk, isLive } = useExperiencesContext();
  const current = useRef<object | undefined>(undefined);
  const consentRevision = useRef(0);
  const initialRequest = useRef({ resetRevision, started: false });
  const latest = useRef({ buildPagePayload, handoff });
  latest.current = { buildPagePayload, handoff };
  const revision = useMemo(() => ({}), [sdk, routeKey, resetRevision, handoff]);

  const requestContext = useMemo(() => {
    let initial:
      | {
          sdk: ContentfulExperiences;
          config: RuntimeFetchResolveOptions['config'];
          key: string;
          identity: string | undefined;
          lifetime: number;
          events: NonNullable<RuntimeFetchExperienceOptions['personalization']>['events'];
          promise: Promise<PortableRenderPlan>;
        }
      | undefined;
    let pageRequested = false;
    let pageIntent = false;
    let pendingPage = false;
    const subscriptions: { unsubscribe(): void }[] = [];
    return {
      revision,
      reset() {
        current.current = undefined;
        callback.current?.cancel();
        onReset();
      },
      disconnect() {
        for (const subscription of subscriptions.splice(0)) subscription.unsubscribe();
      },
      connect(runtime: ContentfulExperiences) {
        if (subscriptions.length) return;
        let previous = runtime.states.consent.current;
        subscriptions.push(
          runtime.states.consent.subscribe((consent) => {
            this.consentChanged(consent, previous);
            previous = consent;
          })
        );
        let first = true;
        // Queue/reset policy clears this outcome. It invalidates joined work; it
        // never supplies the managed content loader's loading/success status.
        subscriptions.push(
          runtime.states.experienceRequestState.subscribe((state) => {
            if (first) {
              first = false;
              return;
            }
            if (runtime.isPreview || state.status !== 'idle') return;
            consentRevision.current += 1;
            initial = undefined;
            pageRequested = false;
            callback.current?.cancel();
          })
        );
      },
      notePageIntent(runtime: ContentfulExperiences) {
        this.connect(runtime);
        pageIntent = true;
        pendingPage = runtime.states.consent.current !== true;
      },
      consentChanged(consent: boolean | undefined, previous: boolean | undefined) {
        if (!isLive || sdk.isPreview) return;
        if (consent === false && previous !== false) {
          consentRevision.current += 1;
          pendingPage = pageIntent;
        }
        if (
          consent !== true ||
          !pendingPage ||
          latest.current.handoff ||
          current.current !== revision ||
          callback.current?.pending
        )
          return;
        const runtime = sdk;
        void runtime
          .trackCurrentPage({
            routeKey,
            buildPayload: latest.current.buildPagePayload ?? (() => ({})),
            isCurrent: () => current.current === revision,
          })
          .then((result) => {
            if (result.accepted) pendingPage = false;
          })
          .catch(() => undefined);
      },
      fetchExperience(
        runtime: ContentfulExperiences,
        request: RuntimeFetchExperienceOptions,
        resolve: RuntimeFetchResolveOptions,
        isRefresh: boolean
      ): Promise<PortableRenderPlan> {
        this.connect(runtime);
        const lifetime = consentRevision.current;
        const isCurrent = () =>
          current.current === revision && consentRevision.current === lifetime;
        if (!isCurrent()) return Promise.reject(new Error('Experience request was superseded'));
        const key = sourceKey(request, resolve);
        const identity = runtime.states.profile.current?.id;
        if (
          !isRefresh &&
          key !== undefined &&
          initial?.key === key &&
          initial.events === request.personalization?.events &&
          initial.identity === identity &&
          initial.lifetime === lifetime &&
          initial.sdk === runtime &&
          initial.config === resolve.config
        )
          return initial.promise;
        let options = request;
        // Explicit arguments/raw events remain the caller's complete intent. Repeated
        // presentations join the supported initial descriptor, rather than rebuild it.
        if (
          !isRefresh &&
          !pageRequested &&
          !runtime.isPreview &&
          latest.current.handoff?.replay?.routeKey !== routeKey &&
          request.personalization?.events === undefined &&
          latest.current.buildPagePayload
        ) {
          const payload = latest.current.buildPagePayload({
            isInitialEmission: !initialRequest.current.started,
          });
          if (payload !== undefined)
            options = {
              ...request,
              personalization: {
                ...request.personalization,
                events: [{ type: 'page', ...payload }],
              },
            };
          pageRequested = true;
        }
        if (!isRefresh && options.personalization?.events?.some((event) => event.type === 'page')) {
          initialRequest.current.started = true;
          pageIntent = true;
          pageRequested = true;
          pendingPage = runtime.states.consent.current !== true;
        }
        const promise = Promise.resolve()
          .then(async () => {
            if (!isCurrent()) throw new Error('Experience request was superseded');
            const plan = await runtime.fetchExperience(options, resolve);
            if (!isCurrent()) throw new Error('Experience request was superseded');
            return plan;
          })
          .finally(() => {
            if (initial?.promise === promise) initial = undefined;
          });
        if (!isRefresh && key !== undefined)
          initial = {
            sdk: runtime,
            config: resolve.config,
            key,
            identity,
            lifetime,
            events: request.personalization?.events,
            promise,
          };
        return promise;
      },
    };
  }, [onReset, revision, routeKey, sdk, isLive]);

  useLayoutEffect(() => {
    current.current = revision;
    if (initialRequest.current.resetRevision !== resetRevision)
      initialRequest.current = { resetRevision, started: false };
    if (
      handoff?.replay?.routeKey === routeKey &&
      handoff.replay.events.some((event) => event.type === 'page')
    )
      initialRequest.current.started = true;
    if (isLive && beforeInitialPage && !handoff && !sdk.isPreview) requestContext.connect(sdk);
    return () => {
      if (current.current === revision) current.current = undefined;
      requestContext.disconnect();
    };
  }, [requestContext, revision, resetRevision, handoff, routeKey, beforeInitialPage, isLive, sdk]);

  const callback = useRef<ReturnType<typeof createInitialPageCallback> | undefined>(undefined);
  useEffect(() => {
    if (handoff?.replay?.routeKey === routeKey) callback.current?.cancel();
  }, [handoff, routeKey]);

  useEffect(() => {
    if (!isLive || !beforeInitialPage || handoff?.replay?.routeKey === routeKey) return;
    const runtime = sdk;
    if (runtime.isPreview) return;
    if (latest.current.buildPagePayload) requestContext.notePageIntent(runtime);
    let sequence = callback.current;
    if (!sequence || sequence.runtime !== runtime || sequence.resetRevision !== resetRevision) {
      sequence?.cancel();
      const lifetime = consentRevision.current;
      const created = createInitialPageCallback(runtime, resetRevision);
      callback.current = sequence = created;
      created.promise = created.run(
        beforeInitialPage,
        () =>
          current.current !== undefined &&
          callback.current === created &&
          consentRevision.current === lifetime
      );
    }
    let cancelled = false;
    const pageLifetime = consentRevision.current;
    const isCurrent = () =>
      !cancelled && current.current === revision && consentRevision.current === pageLifetime;
    void sequence.promise.then(async () => {
      if (
        !isCurrent() ||
        latest.current.handoff?.replay?.routeKey === routeKey ||
        !latest.current.buildPagePayload
      )
        return;
      try {
        requestContext.notePageIntent(runtime);
        await runtime.trackCurrentPage({
          routeKey,
          buildPayload: latest.current.buildPagePayload,
          isCurrent,
        });
      } catch {
        /* Event failures do not replace selected content. */
      }
    });
    return () => {
      cancelled = true;
      // Strict Mode reconnects the same committed owner before this microtask.
      // A final disconnect or replaced owner cancels the watchdog immediately.
      void Promise.resolve().then(() => {
        if (current.current === undefined || callback.current !== sequence) sequence.cancel();
      });
    };
  }, [beforeInitialPage, handoff, isLive, revision, routeKey, sdk, resetRevision, requestContext]);

  return (
    <ExperienceRequestContext.Provider value={requestContext}>
      {children}
    </ExperienceRequestContext.Provider>
  );
}
