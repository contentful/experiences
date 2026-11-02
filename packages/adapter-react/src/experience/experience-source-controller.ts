import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';
import { assertRuntimePreviewRequest } from '@contentful/experiences-runtime';
import type {
  ContentfulExperiences,
  PreviewState,
  FetchExperienceOptions,
  FetchResolveOptions,
  Subscription,
} from '@contentful/experiences-web';

export interface ManagedExperienceSnapshot {
  readonly status: 'idle' | 'loading' | 'success' | 'error';
  readonly data: PortableRenderPlan | undefined;
  readonly error: Error | undefined;
}

export interface ManagedExperienceRequestContext {
  readonly revision: object;
  fetchExperience(
    sdk: ContentfulExperiences,
    request: FetchExperienceOptions,
    resolve: FetchResolveOptions,
    isRefresh: boolean
  ): Promise<PortableRenderPlan>;
}

export interface ExperienceSourceOptions {
  readonly request: FetchExperienceOptions;
  /** Caller descriptor before inherited locale and ordinary attribution defaults. */
  readonly seedRequest?: FetchExperienceOptions;
  readonly resolve: FetchResolveOptions;
  readonly sdk?: ContentfulExperiences;
  readonly requestContext?: ManagedExperienceRequestContext;
  readonly initialPlan?: PortableRenderPlan;
  readonly initialError?: Error;
  readonly waiting?: boolean;
}

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

/** Snapshot only comparison values; opaque values and actual SDK arguments retain identity. */
function snapshotPlain<T>(value: T, seen = new Map<object, unknown>()): T {
  if (value === null || typeof value !== 'object') return value;
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) return value;
  if (seen.has(value)) return seen.get(value) as T;
  const snapshot = Array.isArray(value) ? new Array(value.length) : {};
  seen.set(value, snapshot);
  for (const [key, item] of Object.entries(value)) {
    Object.defineProperty(snapshot, key, {
      value: snapshotPlain(item, seen),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return snapshot as T;
}

function snapshotComparison(options: ExperienceSourceOptions): ExperienceSourceOptions {
  const seen = new Map<object, unknown>();
  return {
    ...options,
    request: snapshotPlain(options.request, seen),
    seedRequest: snapshotPlain(options.seedRequest, seen),
    resolve: { ...options.resolve, metadata: snapshotPlain(options.resolve.metadata, seen) },
    requestContext: options.requestContext ? { ...options.requestContext } : undefined,
  };
}

/** Compare descriptor values, retaining identity for opaque caller inputs. No request cache. */
function sameValue(left: unknown, right: unknown, seen = new Map<object, object>()): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (seen.has(left)) return seen.get(left) === right;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left) && Array.isArray(right) && left.length !== right.length) return false;
  if (
    !Array.isArray(left) &&
    (Object.getPrototypeOf(left) !== Object.prototype ||
      Object.getPrototypeOf(right) !== Object.prototype)
  )
    return false;
  seen.set(left, right);
  const entries = Object.entries(left).filter(([, value]) => value !== undefined);
  return (
    entries.length === Object.values(right).filter((value) => value !== undefined).length &&
    entries.every(
      ([key, value]) =>
        Object.hasOwn(right, key) && sameValue(value, (right as Record<string, unknown>)[key], seen)
    )
  );
}

/**
 * View-specific port of Optimization's OptimizedEntrySourceController at
 * f76f1ff04df1b466c98fc6ce5db6b569f9212438 (MIT), adapted to XDA plans.
 * The SDK owns transport/sharing; this owner guards presentation and thin preview bindings.
 */
export class ExperienceSourceController {
  private options: ExperienceSourceOptions | undefined;
  private comparison: ExperienceSourceOptions | undefined;
  private version = 0;
  private bindingVersion = 0;
  private active = false;
  private supplied = false;
  private requestStatus: ManagedExperienceSnapshot['status'] = 'idle';
  private previewRefreshPending = false;
  private listener: ((snapshot: ManagedExperienceSnapshot) => void) | undefined;
  private subscriptions: Subscription[] = [];
  private previewBinding: Subscription | undefined;
  private previewState: PreviewState | undefined;
  private validationError: Error | undefined;
  private snapshot: ManagedExperienceSnapshot;

  constructor(initialPlan?: PortableRenderPlan, initialError?: Error) {
    this.snapshot = {
      status: initialError ? 'error' : initialPlan ? 'success' : 'idle',
      data: initialPlan,
      error: initialError,
    };
  }

  getSnapshot(): ManagedExperienceSnapshot {
    return this.snapshot;
  }

  isCurrentSnapshot(snapshot: ManagedExperienceSnapshot): boolean {
    return this.active && this.snapshot === snapshot;
  }

  setSnapshotListener(listener: ((snapshot: ManagedExperienceSnapshot) => void) | undefined): void {
    this.listener = listener;
  }

  /** Internal supplied source: invalidate managed work without creating a request. */
  updateSupplied(data: PortableRenderPlan | undefined): void {
    if (this.options) this.disconnect();
    this.options = undefined;
    this.comparison = undefined;
    this.validationError = undefined;
    this.previewRefreshPending = false;
    this.active = true;
    this.supplied = true;
    this.requestStatus = data ? 'success' : 'idle';
    this.publish({ status: this.requestStatus, data, error: undefined });
  }

  /** Called after React commit; never from render. */
  updateOptions(options: ExperienceSourceOptions): void {
    const fromSupplied = this.supplied;
    this.supplied = false;
    const previous = this.comparison;
    const sameResolve =
      previous !== undefined &&
      previous.resolve.config === options.resolve.config &&
      sameValue(previous.resolve.metadata ?? {}, options.resolve.metadata ?? {}) &&
      (previous.resolve.debug ?? false) === (options.resolve.debug ?? false);
    const sameRevision = previous?.requestContext?.revision === options.requestContext?.revision;
    const sameRequest = previous !== undefined && sameValue(previous.request, options.request);
    const callerRequest = options.seedRequest ?? options.request;
    const previousCallerRequest = previous?.seedRequest ?? previous?.request;
    const sameCallerRequest =
      previous !== undefined &&
      (previousCallerRequest === previous.request && callerRequest === options.request
        ? sameRequest
        : sameValue(previousCallerRequest, callerRequest));
    const descriptorChanged =
      previous !== undefined && !(sameResolve && sameRevision && sameRequest);
    const sdkChanged = previous?.sdk !== options.sdk;
    const hasSeed = options.initialPlan !== undefined || options.initialError !== undefined;
    const newSeed =
      hasSeed &&
      (!previous ||
        previous.initialPlan !== options.initialPlan ||
        previous.initialError !== options.initialError);
    const seedActivation =
      previous !== undefined &&
      previous.sdk === undefined &&
      options.sdk !== undefined &&
      hasSeed &&
      options.initialPlan === previous?.initialPlan &&
      options.initialError === previous?.initialError &&
      this.snapshot.data === options.initialPlan &&
      (options.initialError === undefined || this.snapshot.error === options.initialError) &&
      (!previous.waiting || sameRevision) &&
      sameResolve &&
      sameCallerRequest;
    const reconnect = !this.active;
    this.active = true;
    this.options = options;
    this.comparison = snapshotComparison(options);

    const hadValidationError = this.validationError !== undefined;
    if (this.validatePreviewRequest(options.sdk?.states.preview.current)) {
      this.version++;
      this.requestStatus = 'error';
      this.previewRefreshPending = false;
      this.unbind();
      const experienceChanged = previous?.request.experienceId !== options.request.experienceId;
      this.publish({
        data: (previous && !sameRevision) || experienceChanged ? undefined : this.snapshot.data,
        status: 'error',
        error: this.validationError,
      });
      return;
    }

    const changed = !previous || descriptorChanged || sdkChanged || newSeed || hadValidationError;

    const temporaryEnrichment =
      previous !== undefined &&
      sameResolve &&
      sameRevision &&
      sameCallerRequest &&
      (options.waiting || previous.waiting);

    if (changed) {
      this.version++;
      this.requestStatus = 'idle';
      // A seed belongs to its supplied descriptor, and is not reapplied after refresh.
      const retained =
        !fromSupplied &&
        (seedActivation ||
          temporaryEnrichment ||
          (!descriptorChanged && (options.waiting || !previous?.sdk || !sdkChanged)));
      const data = newSeed ? options.initialPlan : retained ? this.snapshot.data : undefined;
      const error = newSeed
        ? options.initialError
        : retained && this.snapshot.error === options.initialError
          ? this.snapshot.error
          : undefined;
      this.publish({ status: error ? 'error' : data ? 'success' : 'idle', data, error });
      if ((data || error) && (newSeed || seedActivation || !descriptorChanged))
        this.requestStatus = error ? 'error' : 'success';
    }
    if (reconnect || changed) {
      this.unbind();
      if (options.sdk) this.bind(options.sdk);
    }
    if (options.waiting && !this.snapshot.data && !this.snapshot.error)
      this.publish({ ...this.snapshot, status: 'loading' });
    if (options.sdk && this.previewRefreshPending) {
      this.previewRefreshPending = false;
      if (!this.previewState?.data) void this.fetch(true);
    } else if (options.sdk && this.requestStatus === 'idle') void this.fetch(false);
  }

  readonly refresh = async (): Promise<void> => {
    if (!this.active || !this.options?.sdk) return;
    this.version++;
    this.previewRefreshPending = false;
    this.requestStatus = 'idle';
    await this.fetch(true);
  };

  readonly retry = (): Promise<void> => this.refresh();

  disconnect(): void {
    this.active = false;
    this.version++;
    if (this.requestStatus === 'loading') this.requestStatus = 'idle';
    this.unbind();
  }

  private async fetch(isRefresh: boolean): Promise<void> {
    const options = this.options;
    const sdk = options?.sdk;
    if (!this.active || !options || !sdk) return;
    const preview = sdk.states.preview.current;
    if (this.validatePreviewRequest(preview)) {
      this.publish({ ...this.snapshot, status: 'error', error: this.validationError });
      this.requestStatus = 'error';
      return;
    }
    const version = ++this.version;
    this.requestStatus = 'loading';
    this.publish({
      ...this.snapshot,
      status: 'loading',
      error:
        preview?.experienceId === undefined || preview.experienceId === options.request.experienceId
          ? preview?.error
          : undefined,
    });
    const current = () =>
      this.active &&
      this.version === version &&
      this.options?.sdk === sdk &&
      this.requestStatus === 'loading';
    let request = options.request;
    if (isRefresh && request.personalization) {
      const { events: _events, ...personalization } = request.personalization;
      request = { ...request, personalization };
    }
    try {
      const data = await (options.requestContext
        ? options.requestContext.fetchExperience(sdk, request, options.resolve, isRefresh)
        : sdk.fetchExperience(request, options.resolve));
      if (!current()) return;
      this.requestStatus = 'success';
      const preview = sdk.states.preview.current;
      const error =
        preview?.experienceId === undefined || preview.experienceId === options.request.experienceId
          ? preview?.error
          : undefined;
      this.publish({ status: error ? 'error' : 'success', data, error });
    } catch (error) {
      if (!current()) return;
      this.requestStatus = 'error';
      this.publish({ ...this.snapshot, status: 'error', error: toError(error) });
    }
  }

  private bind(sdk: ContentfulExperiences): void {
    const bindingVersion = this.bindingVersion;
    const current = () =>
      this.active && this.options?.sdk === sdk && this.bindingVersion === bindingVersion;
    let consent = sdk.states.consent.current;
    this.subscriptions.push(
      sdk.states.consent.subscribe((next) => {
        if (!current()) return;
        const withdrawn =
          (next === false && consent !== false) || (consent === true && next !== true);
        consent = next;
        if (sdk.isPreview || !withdrawn || this.requestStatus !== 'loading') return;
        this.version++;
        // Suppression is terminal for automatic fetching, but explicit commands can recover.
        this.requestStatus = 'success';
        this.publish({
          ...this.snapshot,
          status: this.snapshot.data ? 'success' : 'idle',
          error: undefined,
        });
      })
    );

    let first = true;
    this.subscriptions.push(
      sdk.states.preview.subscribe((state) => {
        if (!current()) return;
        const previous = this.previewState;
        this.previewState = state;
        const id = this.options!.request.experienceId;
        const matches = (value: PreviewState | undefined) =>
          value !== undefined && (value.experienceId === undefined || value.experienceId === id);
        const relevant = matches(previous) || matches(state);
        const sourceChanged =
          !first &&
          relevant &&
          (previous?.sessionId !== state?.sessionId ||
            previous?.experienceId !== state?.experienceId ||
            (previous !== undefined) !== (state !== undefined));
        const contentChanged = !first && matches(state) && previous?.revision !== state?.revision;
        first = false;
        if (sourceChanged || contentChanged) {
          this.version++;
          this.requestStatus = 'success';
          this.bindPreview(sdk, current);
          // The hook's passive update supplies the current source-map descriptor.
          // Never launch a replacement snapshot with the previous session's options.
          if (sourceChanged && !this.validationError) this.previewRefreshPending = !state?.data;
        }
        if (this.validationError) return;
        if (matches(state) && state?.error) {
          this.publish({ ...this.snapshot, status: 'error', error: state.error });
        } else if (previous?.error && this.snapshot.error === previous.error) {
          this.publish({
            ...this.snapshot,
            status: this.snapshot.data ? 'success' : 'idle',
            error: undefined,
          });
        }
      })
    );
    this.bindPreview(sdk, current);
  }

  private bindPreview(sdk: ContentfulExperiences, current: () => boolean): void {
    this.previewBinding?.unsubscribe();
    this.previewBinding = undefined;
    this.previewToken = undefined;
    const options = this.options!;
    const state = this.previewState;
    if (state?.experienceId && state.experienceId !== options.request.experienceId) return;
    if (this.validatePreviewRequest(state)) {
      this.version++;
      this.requestStatus = 'error';
      this.previewRefreshPending = false;
      this.publish({ ...this.snapshot, status: 'error', error: this.validationError });
      return;
    }
    // Binding callbacks may finish after unsubscribe; guard their own generation too.
    const token = {};
    this.previewToken = token;
    try {
      this.previewBinding = sdk.subscribeToPreview(
        options.request.experienceId,
        options.resolve,
        (update) => {
          if (!current() || this.previewToken !== token) return;
          if (update.data) {
            this.version++;
            this.requestStatus = 'success';
            this.previewRefreshPending = false;
          }
          this.publish({
            data: update.data ?? this.snapshot.data,
            error: update.error,
            status: update.error
              ? 'error'
              : update.data || this.snapshot.data
                ? 'success'
                : this.snapshot.status,
          });
        }
      );
    } catch (error) {
      this.publish({ ...this.snapshot, status: 'error', error: toError(error) });
    }
  }

  private previewToken: object | undefined;

  private validatePreviewRequest(state: PreviewState | undefined): Error | undefined {
    const options = this.options!;
    try {
      if (state?.experienceId === options.request.experienceId)
        assertRuntimePreviewRequest(options.seedRequest ?? options.request);
      this.validationError = undefined;
    } catch (error) {
      const next = toError(error);
      if (this.validationError?.message !== next.message) this.validationError = next;
    }
    return this.validationError;
  }

  private unbind(): void {
    this.bindingVersion++;
    this.previewToken = undefined;
    this.previewBinding?.unsubscribe();
    this.previewBinding = undefined;
    for (const subscription of this.subscriptions.splice(0)) subscription.unsubscribe();
    this.previewState = undefined;
  }

  private publish(snapshot: ManagedExperienceSnapshot): void {
    if (
      snapshot.status === this.snapshot.status &&
      snapshot.data === this.snapshot.data &&
      snapshot.error === this.snapshot.error
    )
      return;
    this.snapshot = snapshot;
    this.listener?.(snapshot);
  }
}
