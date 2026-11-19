import { untrack } from 'svelte';
import type { Presentation } from './presentation.svelte.js';
import {
  assertExperienceSelector,
  isNotFoundError,
  isPreviewSessionFetchError,
} from '@contentful/experiences-client';
import type {
  ContentfulExperiences,
  FetchExperienceOptions,
  Subscription,
} from '@contentful/experiences-web';
import type { PageSequence } from '../runtime/page-sequence.svelte.js';
import type {
  ManagedExperienceOperationResult,
  ManagedExperienceAcquireOptions,
  ManagedExperienceSnapshot,
  SourceOptions,
} from './source-types.js';

function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left) && left.length !== (right as unknown[]).length) return false;
  if (
    !Array.isArray(left) &&
    (Object.getPrototypeOf(left) !== Object.prototype ||
      Object.getPrototypeOf(right) !== Object.prototype)
  )
    return false;
  const entries = Object.entries(left).filter(([, value]) => value !== undefined);
  return (
    entries.length === Object.values(right).filter((value) => value !== undefined).length &&
    entries.every(([key, value]) => sameValue(value, (right as Record<string, unknown>)[key]))
  );
}

/** Selection identity is shared by conflict checks and source reuse. */
export function sameSelection(left: SourceOptions, right: SourceOptions): boolean {
  return (
    sameValue(left.request, right.request) &&
    left.resolve.config === right.resolve.config &&
    sameValue(left.resolve.metadata ?? {}, right.resolve.metadata ?? {}) &&
    (left.resolve.debug ?? false) === (right.resolve.debug ?? false)
  );
}

const asError = (value: unknown): Error =>
  value instanceof Error ? value : new Error(String(value));

/** Only Delivery acquisition identity establishes that retained content is invalid. */
function authoritativeFailure(error: unknown, seeded = false): 401 | 403 | 404 | undefined {
  if (!error || typeof error !== 'object' || isPreviewSessionFetchError(error)) return undefined;
  const failure = error as { name?: string; cause?: { statusCode?: unknown } };
  if ((seeded || failure.name === 'NotFoundError') && isNotFoundError(error)) return 404;
  // Client tags acquisition failures before resolution; callback HTTP causes do
  // not establish that this Experience is missing or inaccessible.
  const status = failure.name === 'ExperienceFetchError' ? failure.cause?.statusCode : undefined;
  return status === 401 || status === 403 || status === 404 ? status : undefined;
}

interface SourceEnvironment {
  getSdk(): ContentfulExperiences | undefined;
  getLocale(): string | undefined;
  route: PageSequence;
  presentation: Presentation<ManagedExperienceOperationResult>;
}
interface Selection {
  options: SourceOptions;
  request: FetchExperienceOptions;
  sdk?: ContentfulExperiences;
  locale?: string;
  revision: object;
  routeKey: string;
  host?: {
    current(): boolean;
    redirect(
      result: ManagedExperienceOperationResult,
      isCurrent: () => boolean,
      baseline: ManagedExperienceSnapshot['data']
    ): Promise<void>;
  };
}
type Acquire = (
  options: ManagedExperienceAcquireOptions
) => Promise<ManagedExperienceOperationResult | undefined>;
type BrowserSelection = {
  acquire: Acquire;
  retry(): Promise<void>;
};
export interface PrimarySource {
  readonly current: ManagedExperienceSnapshot;
  refresh(): Promise<void>;
  retry(): Promise<void>;
  fromCommittedRequest(
    options: SourceOptions,
    host: NonNullable<Selection['host']>
  ): BrowserSelection;
  attach(getOptions: () => SourceOptions | undefined): { update(): void; release(): void };
  reset(): void;
  dispose(): void;
}

/** One primary selection owns acquisition, retained presentation and notification authority. */
export function createPrimarySource(environment: SourceEnvironment): PrimarySource {
  const { route } = environment;
  const registrations = new Set<() => SourceOptions | undefined>();
  let selection: Selection | undefined;
  let currentActions: BrowserSelection | undefined;
  const { presentation } = environment;
  let operation: object | undefined;
  let disposed = false;
  let binding: Subscription | undefined;
  let boundExperience: string | undefined;

  const selected = (value: Selection) =>
    !disposed &&
    (value.host?.current() ?? (selection === value && presentation.isSelected(value))) &&
    route.revision === value.revision &&
    environment.getSdk() === value.sdk &&
    (value.options.request.locale ?? environment.getLocale()) === value.locale;
  const authority =
    (value: Selection, lifetime = value.sdk?.captureLifetime() ?? (() => true)) =>
    () =>
      selected(value) && lifetime();
  type Outcome = Omit<ManagedExperienceOperationResult, 'id' | 'routeKey' | 'request'>;
  function complete(
    value: Selection,
    request: FetchExperienceOptions,
    outcome: Outcome | undefined,
    isCurrent = authority(value),
    invalidatesData = false,
    settled = true
  ) {
    const result = outcome ? { id: {}, routeKey: value.routeKey, request, ...outcome } : undefined;
    presentation.complete(result, { ...outcome, invalidatesData }, isCurrent, settled);
    return result;
  }
  function stopBindings() {
    binding?.unsubscribe();
    binding = undefined;
    boundExperience = undefined;
  }
  function detach() {
    const ownsPresentation = selection && presentation.isSelected(selection);
    selection = undefined;
    currentActions = undefined;
    operation = undefined;
    stopBindings();
    if (ownsPresentation) presentation.clear();
  }
  function bindPreview(value: Selection) {
    const sdk = value.sdk;
    if (
      !sdk ||
      presentation.current.redirect ||
      (value.request.destinationId !== undefined && sdk.environmentId !== 'master')
    )
      return;
    const experienceId = value.request.experienceId ?? presentation.current.data?.experienceId;
    if (!experienceId || experienceId === boundExperience) return;
    binding?.unsubscribe();
    boundExperience = experienceId;
    binding = sdk.subscribeToPreview(experienceId, value.options.resolve, (update) => {
      if (!selected(value) || presentation.current.redirect || !route.isCurrent()) return;
      // Live content supersedes pending HTTP; an error-only update leaves it pending.
      if (update.data) operation = undefined;
      complete(
        value,
        value.request,
        { plan: update.data, error: update.error },
        authority(value),
        false,
        update.data !== undefined
      );
    });
  }
  async function fetch(value: Selection, request: FetchExperienceOptions, refresh: boolean) {
    const sdk = value.sdk;
    if (!sdk || !selected(value) || presentation.current.redirect) return;
    const attempt = {};
    operation = attempt;
    const lifetime = sdk.captureLifetime();
    const baseline = presentation.current.data;
    const rollback = presentation.begin(authority(value, lifetime));
    const sourceCurrent = () =>
      selected(value) &&
      route.isCurrent() &&
      (value.options.request.locale !== undefined || sdk.locale === value.locale);
    const current = () => sourceCurrent() && operation === attempt;
    if (!value.host) bindPreview(value);
    let outcome: Outcome;
    let failure: ReturnType<typeof authoritativeFailure>;
    try {
      const response = await route.fetchExperience(
        sdk,
        request,
        value.options.resolve,
        refresh,
        current,
        sourceCurrent
      );
      outcome = 'redirect' in response ? response : { plan: response };
    } catch (cause) {
      failure = authoritativeFailure(cause);
      outcome = { error: asError(cause), ...(failure === 404 ? { notFound: true } : {}) };
    }
    if (!current()) return;
    if (!lifetime()) {
      rollback();
      return;
    }
    const invalidatesData = !!outcome.error && !sdk.isPreview && failure !== undefined;
    if (outcome.redirect) {
      binding?.unsubscribe();
      binding = undefined;
      boundExperience = undefined;
      route.abandonPresentation();
    }
    const isCurrent = () => current() && lifetime();
    const result = complete(value, request, outcome, isCurrent, invalidatesData);
    if (result?.redirect && value.host) await value.host.redirect(result, isCurrent, baseline);
    if (!value.host) bindPreview(value);
    return result;
  }
  function actions(value: Selection): BrowserSelection {
    let acquired = false;
    return {
      acquire(options) {
        if (!value.sdk || value.sdk.isPreview || !selected(value) || presentation.current.redirect)
          return Promise.resolve(undefined);
        acquired = true;
        return fetch(value, { ...value.request, personalization: options.personalization }, false);
      },
      async retry() {
        const { personalization, ...selector } = value.request;
        const { events: _events, ...continuity } = personalization ?? {};
        // One-off action personalization must not outlive the operation or a visitor reset.
        await fetch(
          value,
          !acquired && personalization ? { ...selector, personalization: continuity } : selector,
          true
        );
      },
    };
  }
  function createSelection(options: SourceOptions, host?: Selection['host']): Selection {
    const sdk = environment.getSdk();
    const raw = options.request;
    const locale = raw.locale ?? environment.getLocale();
    const request = {
      ...raw,
      locale: raw.locale ?? (sdk?.isPreview ? undefined : locale),
      ...(raw.experienceId !== undefined && !sdk?.isPreview
        ? { extensions: { ...raw.extensions, sourceMap: raw.extensions?.sourceMap ?? {} } }
        : {}),
    } as FetchExperienceOptions;
    return {
      options,
      sdk,
      locale,
      request,
      revision: route.revision,
      routeKey: route.routeKey,
      host,
    };
  }
  function apply(options: SourceOptions) {
    // Validate raw selectors before seeds, normalization, Preview or route intent.
    assertExperienceSelector(options.request);
    const sdk = environment.getSdk();
    const locale = options.request.locale ?? environment.getLocale();
    const revision = route.revision;
    const routeKey = route.routeKey;
    untrack(() => {
      const previous = selection;
      const same =
        previous &&
        sameSelection(previous.options, options) &&
        previous.sdk === sdk &&
        previous.locale === locale &&
        previous.revision === revision;
      const newSeed =
        (options.initialPlan !== undefined || options.initialError !== undefined) &&
        (!previous ||
          previous.options.initialPlan !== options.initialPlan ||
          previous.options.initialError !== options.initialError);
      if (same && !newSeed) return;
      const activatingSeed =
        previous &&
        !previous.sdk &&
        sameSelection(previous.options, options) &&
        previous.routeKey === routeKey;
      stopBindings();
      operation = undefined;
      const value = (selection = createSelection(options));
      const actionsForSelection = (currentActions = actions(value));
      const error = newSeed
        ? options.initialError
        : activatingSeed
          ? presentation.current.error
          : undefined;
      const failure = authoritativeFailure(error, true);
      const candidate = newSeed
        ? options.initialPlan
        : activatingSeed
          ? presentation.current.data
          : undefined;
      const data = sdk?.isPreview || failure === undefined ? candidate : undefined;
      presentation.select(value, actionsForSelection.retry, actionsForSelection.acquire);
      complete(
        value,
        value.request,
        data || error
          ? { plan: data, error, ...(failure === 404 ? { notFound: true } : {}) }
          : undefined,
        authority(value)
      );

      if (sdk && presentation.current.status === 'idle') void fetch(value, value.request, false);
      else bindPreview(value);
    });
  }
  function update(getOptions: () => SourceOptions | undefined) {
    const options = getOptions();
    if (!options) throw new Error('A managed primary selection is required when attaching.');
    assertExperienceSelector(options.request);
    const newSeed =
      (options.initialPlan !== undefined || options.initialError !== undefined) &&
      (selection?.options.initialPlan !== options.initialPlan ||
        selection?.options.initialError !== options.initialError);
    if (selection && (!sameSelection(selection.options, options) || newSeed)) registrations.clear();
    registrations.add(getOptions);
    apply(options);
    return options;
  }
  const refresh = () => currentActions?.retry() ?? Promise.resolve();
  return {
    get current() {
      return presentation.current;
    },
    refresh,
    retry: refresh,
    fromCommittedRequest(options, host) {
      assertExperienceSelector(options.request);
      return actions(createSelection(options, host));
    },
    attach(getOptions) {
      if (disposed) throw new Error('Cannot attach to a disposed Experiences root.');
      const initial = getOptions();
      if (initial) assertExperienceSelector(initial.request);
      // Mounting an event-bearing selector declares fresh intent. Outgoing views may still exist.
      if (
        initial?.request.personalization?.events?.length &&
        initial.initialPlan === undefined &&
        initial.initialError === undefined
      ) {
        registrations.clear();
        selection = undefined;
      }
      let previous = update(getOptions);
      let released = false;
      return {
        update() {
          if (released || disposed) return;
          const next = getOptions();
          if (
            next &&
            (registrations.has(getOptions) ||
              !sameSelection(previous, next) ||
              previous.initialPlan !== next.initialPlan ||
              previous.initialError !== next.initialError)
          )
            previous = update(getOptions);
        },
        release() {
          if (released) return;
          released = true;
          if (registrations.delete(getOptions) && !registrations.size) detach();
        },
      };
    },
    reset() {
      operation = undefined;
      presentation.reset();
    },
    dispose() {
      if (!disposed) {
        disposed = true;
        registrations.clear();
        detach();
      }
    },
  };
}
