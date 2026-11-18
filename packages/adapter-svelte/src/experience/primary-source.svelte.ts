import { untrack } from 'svelte';
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

const idle = (): ManagedExperienceSnapshot => ({
  status: 'idle',
  data: undefined,
  error: undefined,
});
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
}
interface Selection {
  options: SourceOptions;
  request: FetchExperienceOptions;
  sdk?: ContentfulExperiences;
  locale?: string;
  revision: object;
  routeKey: string;
}
interface Publication {
  snapshot: ManagedExperienceSnapshot;
  isCurrent(): boolean;
  redirectClaimed?: boolean;
}
export interface PrimarySource {
  readonly current: ManagedExperienceSnapshot;
  refresh(): Promise<void>;
  retry(): Promise<void>;
  attach(getOptions: () => SourceOptions | undefined): { update(): void; release(): void };
  isCurrentSnapshot(snapshot: ManagedExperienceSnapshot): boolean;
  claimRedirect(snapshot: ManagedExperienceSnapshot): boolean;
  rejectRedirect(error: unknown): void;
  reset(): void;
  dispose(): void;
}

/** One primary selection owns acquisition, retained presentation and notification authority. */
export function createPrimarySource(environment: SourceEnvironment): PrimarySource {
  const { route } = environment;
  const registrations = new Set<() => SourceOptions | undefined>();
  let selection: Selection | undefined;
  let publication = $state.raw<Publication>({ snapshot: idle(), isCurrent: () => false });
  let completed = untrack(() => publication);
  let operation: object | undefined;
  let disposed = false;
  let binding: Subscription | undefined;
  let boundExperience: string | undefined;

  const selected = (value: Selection) =>
    !disposed &&
    selection === value &&
    route.revision === value.revision &&
    environment.getSdk() === value.sdk &&
    (value.options.request.locale ?? environment.getLocale()) === value.locale;
  const authority =
    (value: Selection, lifetime = value.sdk?.captureLifetime() ?? (() => true)) =>
    () =>
      selected(value) && lifetime();
  function publish(snapshot: ManagedExperienceSnapshot, isCurrent: () => boolean) {
    publication = { snapshot, isCurrent };
  }
  type Outcome = Omit<ManagedExperienceOperationResult, 'id' | 'routeKey' | 'request'>;
  function complete(
    outcome: Outcome | undefined,
    data = outcome?.plan,
    isCurrent = authority(selection!),
    emptyStatus: ManagedExperienceSnapshot['status'] = 'idle'
  ) {
    publish(
      {
        status: outcome?.redirect
          ? 'redirect'
          : outcome?.error
            ? 'error'
            : data
              ? 'success'
              : emptyStatus,
        data,
        error: outcome?.error,
        redirect: outcome?.redirect,
        result: outcome
          ? { id: {}, routeKey: selection!.routeKey, request: selection!.request, ...outcome }
          : undefined,
      },
      isCurrent
    );
  }
  function stopBindings() {
    binding?.unsubscribe();
    binding = undefined;
    boundExperience = undefined;
  }
  function detach() {
    selection = undefined;
    operation = undefined;
    stopBindings();
    publish(idle(), () => false);
    completed = publication;
  }
  function bindPreview(value: Selection) {
    const sdk = value.sdk;
    if (
      !sdk ||
      publication.snapshot.redirect ||
      (value.request.destinationId !== undefined && sdk.environmentId !== 'master')
    )
      return;
    const experienceId = value.request.experienceId ?? publication.snapshot.data?.experienceId;
    if (!experienceId || experienceId === boundExperience) return;
    binding?.unsubscribe();
    boundExperience = experienceId;
    binding = sdk.subscribeToPreview(experienceId, value.options.resolve, (update) => {
      if (!selected(value) || publication.snapshot.redirect || !route.isCurrent()) return;
      // Live content supersedes pending HTTP; an error-only update leaves it pending.
      if (update.data) operation = undefined;
      const data = update.data ?? publication.snapshot.data;
      complete(
        { plan: update.data, error: update.error },
        data,
        authority(value),
        publication.snapshot.status
      );
      if (update.data) completed = publication;
    });
  }
  async function fetch(isRefresh: boolean) {
    const value = selection;
    const sdk = value?.sdk;
    if (!value || !sdk || publication.snapshot.redirect) return;
    const attempt = {};
    operation = attempt;
    const lifetime = sdk.captureLifetime();
    const profileId = sdk.states.profile.current?.id;
    if (publication.snapshot.status !== 'loading') completed = publication;
    const previous = completed;
    const sourceCurrent = () =>
      selected(value) &&
      route.isCurrent() &&
      (value.options.request.locale !== undefined || sdk.locale === value.locale);
    const current = () => sourceCurrent() && operation === attempt;
    publish(
      { status: 'loading', data: publication.snapshot.data, error: undefined },
      authority(value, lifetime)
    );
    bindPreview(value);
    let outcome: Outcome;
    let failure: ReturnType<typeof authoritativeFailure>;
    try {
      const response = await route.fetchExperience(
        sdk,
        value.request,
        value.options.resolve,
        isRefresh,
        sourceCurrent
      );
      outcome = 'redirect' in response ? response : { plan: response };
    } catch (cause) {
      failure = authoritativeFailure(cause);
      outcome = { error: asError(cause), ...(failure === 404 ? { notFound: true } : {}) };
    }
    if (!current()) return;
    if (!lifetime()) {
      publication = previous;
      return;
    }
    let data = outcome.plan;
    if (outcome.error) {
      const retain = sdk.isPreview || failure === undefined;
      if (retain && sdk.states.profile.current?.id === profileId) data = publication.snapshot.data;
    }
    if (outcome.redirect) {
      binding?.unsubscribe();
      binding = undefined;
      boundExperience = undefined;
      route.abandonPresentation();
    }
    complete(outcome, data, authority(value, lifetime));
    completed = publication;
    bindPreview(value);
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
      const raw = options.request;
      const request = {
        ...raw,
        locale: raw.locale ?? (sdk?.isPreview ? undefined : locale),
        ...(raw.experienceId !== undefined && !sdk?.isPreview
          ? { extensions: { ...raw.extensions, sourceMap: raw.extensions?.sourceMap ?? {} } }
          : {}),
      } as FetchExperienceOptions;
      const value = (selection = { options, sdk, locale, request, revision, routeKey });
      const error = newSeed
        ? options.initialError
        : activatingSeed
          ? publication.snapshot.error
          : undefined;
      const failure = authoritativeFailure(error, true);
      const candidate = newSeed
        ? options.initialPlan
        : activatingSeed
          ? publication.snapshot.data
          : undefined;
      const data = sdk?.isPreview || failure === undefined ? candidate : undefined;
      complete(
        data || error
          ? { plan: data, error, ...(failure === 404 ? { notFound: true } : {}) }
          : undefined,
        data,
        authority(value)
      );
      completed = publication;
      if (sdk && publication.snapshot.status === 'idle') void fetch(false);
      else bindPreview(value);
    });
  }
  function update(getOptions: () => SourceOptions | undefined) {
    const options = getOptions();
    if (!options) throw new Error('A managed primary selection is required when attaching.');
    for (const other of registrations) {
      const current = untrack(other);
      if (other !== getOptions && current && !sameSelection(current, options))
        throw new Error(
          'One managed primary Experience selection is supported per Experiences root.'
        );
    }
    apply(options);
  }
  const refresh = () => fetch(true);
  return {
    get current() {
      return publication.snapshot;
    },
    refresh,
    retry: refresh,
    isCurrentSnapshot: (snapshot) => publication.snapshot === snapshot && publication.isCurrent(),
    claimRedirect(snapshot) {
      if (
        publication.snapshot !== snapshot ||
        !snapshot.redirect ||
        !publication.isCurrent() ||
        publication.redirectClaimed
      )
        return false;
      publication.redirectClaimed = true;
      return true;
    },
    attach(getOptions) {
      if (disposed) throw new Error('Cannot attach to a disposed Experiences root.');
      update(getOptions);
      registrations.add(getOptions);
      return {
        update() {
          if (registrations.has(getOptions)) update(getOptions);
        },
        release() {
          if (registrations.delete(getOptions) && !registrations.size) detach();
        },
      };
    },
    rejectRedirect(value) {
      if (!selection) return;
      operation = undefined;
      const error = asError(value);
      complete({ error });
      completed = publication;
    },
    reset() {
      operation = undefined;
      if (publication.snapshot.status === 'loading') publication = completed;
      // Retention is allowed; old visitor work and notifications lose authority.
      publication = { ...publication, isCurrent: () => false };
      completed = publication;
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
