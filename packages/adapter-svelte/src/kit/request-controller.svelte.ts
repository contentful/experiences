import { resolvePreviewSessionId } from '@contentful/experiences-runtime';
import type { ContentfulExperiences } from '@contentful/experiences-web';
import { createPresentation, type PresentedExperience } from '../experience/presentation.svelte.js';
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

/** Exact committed sources and request history survive keyed Web activations. */
export function createRequestController(redirect: (path: string) => void | Promise<unknown>) {
  const presentation = createPresentation<RequestResult>(refresh);
  let sdk: ContentfulExperiences | undefined;
  let route: PageSequence | undefined;
  let source: ManagedRequestSource | undefined;
  let committedKey: string | undefined;
  let sessionId: string | undefined;
  let operation:
    | {
        source: ManagedRequestSource;
        candidate: RequestCandidate;
        selection: string;
        sdk: ContentfulExperiences;
        promise?: Promise<void>;
      }
    | undefined;
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
  async function adopt(candidate: RequestCandidate, isCurrent: () => boolean) {
    if (!isCurrent() || !applicable(candidate)) return;
    const next = candidate.result;
    const baseline = presentation.current.data;
    present(candidate, isCurrent);
    if (next?.redirect) {
      route?.abandonPresentation();
      const path = next.redirect.path;
      const fail = () => {
        if (isCurrent())
          presentation.complete(
            next,
            {
              plan: baseline,
              error: new TypeError('Destination redirect must be a local absolute path.'),
            },
            isCurrent
          );
      };
      if (
        !path.startsWith('/') ||
        path.startsWith('//') ||
        /[\\\t\r\n]/.test(path) ||
        new globalThis.URL(path, 'https://redirect.invalid').pathname.startsWith('//')
      )
        fail();
      else if (typeof window !== 'undefined') {
        try {
          await redirect(path);
        } catch {
          fail();
        }
      }
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
    const value = { source: candidateSource, sdk: owner, candidate, selection } as NonNullable<
      typeof operation
    >;
    operation = value;
    presentationKey = selection;
    presentation.select(selection, refresh);
    route?.update({ routeKey: key, selection });
    const isCurrent = () =>
      !disposed &&
      operation === value &&
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
      presentation.select(value.selection, refresh);
      route?.update({ routeKey: key, selection: value.selection });
      await adopt(value.candidate, isCurrent);
    })();
    return value.promise;
  }
  function refresh(): Promise<void> {
    return source && committedKey && presentation.isSelected(presentationKey)
      ? run(source, committedKey, true)
      : Promise.resolve();
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
      presentation.select(presentationKey, refresh);
      present(state, () => !disposed);
    },
    attach(next: ContentfulExperiences | undefined, sequence: PageSequence, nextSession?: string) {
      if (sdk === next && route === sequence) return;
      if (sdk && sdk !== next) presentation.clear();
      operation = undefined;
      sdk = next;
      sessionId = nextSession;
      route = sequence;
    },
    observeLocale() {
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
        (result?.experience && 'experienceId' in result.experience
          ? result.experience.experienceId
          : undefined);
      if (sdk?.isPreview && id && experienceId === id) void refresh();
    },
    update(candidate: ManagedRequestSource | undefined, key: string): Promise<void> {
      if (disposed) return Promise.resolve();
      if (!candidate) {
        source = operation = undefined;
        committedKey = undefined;
        if (presentation.isSelected(presentationKey)) {
          route?.abandonPresentation();
          presentation.clear();
        }
        return Promise.resolve();
      }
      const state = getRequestSourceState(candidate);
      if (state.routeKey !== key) {
        if (committedKey === key) return Promise.resolve();
        source = undefined;
        committedKey = key;
        operation = undefined;
        if (presentation.isSelected(presentationKey)) {
          route?.abandonPresentation();
          presentation.clear();
        }
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
        presentation.select(presentationKey, refresh);
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
