import { resolvePreviewSessionId } from '@contentful/experiences-runtime';
import type { ContentfulExperiences } from '@contentful/experiences-web';
import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';
import { createPresentation, type PresentedExperience } from '../experience/presentation.svelte.js';
import type { PrimarySource } from '../experience/primary-source.svelte.js';
import type {
  ManagedExperienceAcquireOptions,
  ManagedExperienceOperationResult,
} from '../experience/source-types.js';
import type { Config } from '../registry/types.js';
import type { PageSequence } from '../runtime/page-sequence.svelte.js';
import type { RequestResult } from './request-result.js';
import {
  getRequestSourceState,
  readRequestSource,
  requestSelection,
  type RequestCandidate,
  type ManagedRequestSource,
} from './request-source.js';
export type ManagedRequestExperience = PresentedExperience<RequestResult>;
type Result = RequestResult | ManagedExperienceOperationResult;
interface RequestOperation {
  source: ManagedRequestSource;
  candidate: RequestCandidate;
  selection: string;
  sdk: ContentfulExperiences;
  promise?: Promise<void>;
  browser?: {
    locale?: string;
  };
}

/** Exact committed sources and request history survive keyed Web activations. */
export function createRequestController(
  redirect: (path: string) => void | Promise<unknown>,
  config: Config = { components: {} }
) {
  const presentation = createPresentation<Result>(refresh);
  let sdk: ContentfulExperiences | undefined;
  let route: PageSequence | undefined;
  let getBrowserSource: (() => PrimarySource) | undefined;
  let source: ManagedRequestSource | undefined;
  let committedKey: string | undefined;
  let sessionId: string | undefined;
  let operation: RequestOperation | undefined;
  let presentationKey: string | undefined;
  let disposed = false;
  const history = new Set<string>();

  function applicable(candidate: RequestCandidate) {
    return (
      (!('locale' in candidate) ||
        (candidate.experience ?? candidate.result?.experience)?.locale !== undefined ||
        candidate.locale === sdk?.locale) &&
      (!sdk?.config.preview ||
        (candidate.sessionId ??
          resolvePreviewSessionId(new URLSearchParams(candidate.routeKey.split('?')[1]))) ===
          sessionId)
    );
  }
  function present(candidate: RequestCandidate, isCurrent: () => boolean) {
    const next = candidate.result;
    presentation.complete(
      next,
      {
        plan: next?.plan,
        error: candidate.error ?? (next?.contentError ? new Error(next.contentError) : undefined),
        redirect: next?.redirect,
        invalidatesData: next?.notFound || next?.contentErrorKind === 'authorization',
      },
      isCurrent
    );
  }
  async function followRedirect(
    result: Result,
    isCurrent: () => boolean,
    baseline: PortableRenderPlan | undefined
  ) {
    if (!result.redirect || !isCurrent()) return;
    const path = result.redirect.path;
    try {
      if (
        !path.startsWith('/') ||
        path.startsWith('//') ||
        /[\\\t\r\n]/.test(path) ||
        new globalThis.URL(path, 'https://redirect.invalid').pathname.startsWith('//')
      )
        throw new TypeError('Destination redirect must be a local absolute path.');
      if (typeof window !== 'undefined') {
        if ('request' in result) presentation.claimRedirect(presentation.current);
        await redirect(path);
      }
    } catch {
      if (isCurrent())
        presentation.complete(
          result,
          {
            plan: baseline,
            error: new TypeError('Destination redirect must be a local absolute path.'),
          },
          isCurrent
        );
    }
  }
  async function adopt(candidate: RequestCandidate, isCurrent: () => boolean) {
    if (!isCurrent() || !applicable(candidate)) return;
    const next = candidate.result;
    const baseline = presentation.current.data;
    present(candidate, isCurrent);
    if (next?.redirect) {
      route?.abandonPresentation();
      await followRedirect(next, isCurrent, baseline);
      return;
    }
    const alreadyAdopted = next ? history.has(`${next.requestId}\n${next.routeKey}`) : false;
    if (next && !alreadyAdopted) history.add(`${next.requestId}\n${next.routeKey}`);
    if (next)
      await route?.adoptRequest(
        {
          ...next,
          preparation: candidate.preparation ?? sdk?.capturePreparation(),
          explicitEvents: next.experience.personalization?.events !== undefined,
          isCurrent,
        },
        alreadyAdopted
      );
  }
  function run(candidateSource: ManagedRequestSource, key: string, read = false): Promise<void> {
    if (disposed || !sdk || getRequestSourceState(candidateSource).routeKey !== key)
      return Promise.resolve();
    const owner = sdk;
    const lifetime = owner.captureLifetime();
    if (!lifetime()) return Promise.resolve();
    const acquired =
      read && operation?.source === candidateSource
        ? operation.candidate
        : getRequestSourceState(candidateSource);
    const candidate = {
      ...acquired,
      locale:
        (acquired.experience ?? acquired.result?.experience)?.locale ??
        (read ? owner.locale : (acquired.locale ?? owner.locale)),
    };
    const selection = requestSelection(candidate);
    const value: RequestOperation = { source: candidateSource, sdk: owner, candidate, selection };
    operation = value;
    presentationKey = selection;
    presentation.select(selection, refresh, acquire);
    route?.updateSelection(key, selection);
    const isCurrent = () =>
      !disposed &&
      operation === value &&
      !value.browser &&
      route?.routeKey === key &&
      presentation.isSelected(value.selection) &&
      sdk === owner &&
      lifetime() &&
      applicable(value.candidate);
    const rollback = read ? presentation.begin(isCurrent) : undefined;
    value.promise = (async () => {
      let outcome: RequestCandidate = candidate;
      if (read) {
        try {
          outcome = await readRequestSource(candidateSource);
        } catch (error) {
          outcome = {
            ...candidate,
            result: undefined,
            error: error instanceof Error ? error : new Error(String(error)),
          };
        }
      }
      if (!isCurrent() || !applicable(outcome)) {
        rollback?.();
        return;
      }
      value.candidate = {
        ...outcome,
        locale:
          (outcome.experience ?? outcome.result?.experience)?.locale ??
          outcome.locale ??
          owner.locale,
      };
      value.selection = requestSelection(value.candidate);
      presentationKey = value.selection;
      presentation.select(value.selection, refresh, acquire);
      route?.updateSelection(key, value.selection);
      await adopt(value.candidate, isCurrent);
    })();
    return value.promise;
  }
  function refresh(): Promise<void> {
    return source && committedKey && presentation.isSelected(presentationKey)
      ? run(source, committedKey, true)
      : Promise.resolve();
  }
  function ownsPresentation(value: RequestOperation, sequence = route) {
    return (
      !disposed &&
      operation === value &&
      sdk === value.sdk &&
      route === sequence &&
      sequence?.isCurrent() === true &&
      sequence.routeKey === value.candidate.routeKey &&
      presentation.isSelected(value.selection)
    );
  }
  function selectBrowser(value: RequestOperation) {
    const sequence = route;
    const experience = value.candidate.experience ?? value.candidate.result?.experience;
    if (!experience || !getBrowserSource) return;
    const { personalization: _personalization, ...selector } = experience;
    const browser = { locale: selector.locale ?? value.sdk.locale };
    const actions = getBrowserSource().fromCommittedRequest(
      {
        request: selector,
        resolve: { ...value.candidate.resolveOptions, config },
      },
      {
        current: () => ownsPresentation(value, sequence) && value.browser === browser,
        redirect: followRedirect,
      }
    );
    value.browser = browser;
    presentation.select(value.selection, actions.retry, acquire);
    return actions;
  }
  function acquire(options: ManagedExperienceAcquireOptions) {
    const value = operation;
    if (
      !value ||
      !ownsPresentation(value) ||
      (!value.browser && !applicable(value.candidate)) ||
      value.sdk.isPreview ||
      presentation.current.redirect
    )
      return Promise.resolve(undefined);
    return selectBrowser(value)?.acquire(options) ?? Promise.resolve(undefined);
  }
  function removeSource(key: string | undefined) {
    if (presentationKey !== undefined && presentation.isSelected(presentationKey)) {
      // The native route may already have advanced. Leave its fresh browser intent intact.
      if (route?.routeKey === committedKey) route?.abandonPresentation();
      presentation.clear();
    }
    source = operation = undefined;
    committedKey = key;
  }
  return {
    presentation,
    refresh,
    get source() {
      return source;
    },
    get selection() {
      return operation?.selection;
    },
    seed(candidate: ManagedRequestSource | undefined) {
      if (!candidate) return;
      const state = getRequestSourceState(candidate);
      presentationKey = requestSelection(state);
      presentation.select(presentationKey, refresh, acquire);
      present(state, () => !disposed);
    },
    attach(
      next: ContentfulExperiences | undefined,
      sequence: PageSequence,
      nextSession?: string,
      browserSource?: () => PrimarySource
    ) {
      if (sdk === next && route === sequence) return;
      if (sdk && sdk !== next) presentation.clear();
      operation = undefined;
      sdk = next;
      sessionId = nextSession;
      route = sequence;
      getBrowserSource = browserSource;
    },
    observeLocale() {
      if (operation?.browser && ownsPresentation(operation)) {
        const selector = operation.candidate.experience ?? operation.candidate.result?.experience;
        if (selector?.locale === undefined && operation.browser.locale !== operation.sdk.locale) {
          route?.abandonPresentation();
          presentation.reset();
          presentation.invalidateData();
          selectBrowser(operation);
        }
        return;
      }
      if (
        operation &&
        presentation.isSelected(operation.selection) &&
        !applicable(operation.candidate)
      ) {
        operation = undefined;
        route?.abandonPresentation();
        presentation.invalidateData();
      }
    },
    refreshPreview(experienceId: unknown) {
      const result = presentation.current.result;
      const id =
        presentation.current.data?.experienceId ??
        result?.plan?.experienceId ??
        (result && 'experience' in result && 'experienceId' in result.experience
          ? result.experience.experienceId
          : undefined);
      if (sdk?.isPreview && id && experienceId === id) void refresh();
    },
    update(candidate: ManagedRequestSource | undefined, key: string): Promise<void> {
      if (disposed) return Promise.resolve();
      if (!candidate) {
        removeSource(undefined);
        return Promise.resolve();
      }
      const state = getRequestSourceState(candidate);
      if (state.routeKey !== key) {
        if (committedKey === key) return Promise.resolve();
        removeSource(key);
        return Promise.resolve();
      }
      if (
        source === candidate &&
        committedKey === key &&
        operation &&
        operation.sdk === sdk &&
        operation.promise
      )
        return operation.promise;
      source = candidate;
      committedKey = key;
      if (!sdk) {
        operation = undefined;
        presentationKey = requestSelection(state);
        presentation.select(presentationKey, refresh, acquire);
        present(state, () => !disposed);
        return Promise.resolve();
      }
      return run(candidate, key);
    },
    dispose() {
      disposed = true;
      source = operation = undefined;
      presentation.reset();
      history.clear();
    },
  };
}
export type RequestController = ReturnType<typeof createRequestController>;
