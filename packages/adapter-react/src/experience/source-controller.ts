import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';
import {
  isDestinationRedirect,
  type ContentfulExperiences,
  type CurrentPageOptions,
  type DestinationRedirectResult,
  type ExperienceRequest,
  type FetchByDestinationPathOptions,
  type FetchResolveOptions,
  type Subscription,
} from '@contentful/experiences-web';

/** A Destination redirect: an explicit outcome the application navigates, never content. */
export type ExperienceRedirect = DestinationRedirectResult['redirect'];

export interface ManagedExperienceSnapshot {
  readonly status: 'idle' | 'loading' | 'success' | 'error' | 'redirect';
  readonly data: PortableRenderPlan | undefined;
  readonly error: Error | undefined;
  /** Present only with `status: 'redirect'`, which never carries content. */
  readonly redirect?: ExperienceRedirect;
}

export interface ManagedExperienceRequestContext {
  readonly revision: object;
  fetchExperience(
    sdk: ContentfulExperiences,
    request: ExperienceRequest,
    resolve: FetchResolveOptions,
    isRefresh: boolean
  ): Promise<PortableRenderPlan | DestinationRedirectResult>;
}

export interface ExperienceSourceOptions {
  readonly request: ExperienceRequest;
  /** Content locale for invalidation, even when Preview transport omits inherited locale. */
  readonly effectiveLocale?: string;
  /** Caller descriptor before inherited locale and ordinary attribution defaults. */
  readonly seedRequest?: ExperienceRequest;
  readonly resolve: FetchResolveOptions;
  readonly sdk?: ContentfulExperiences;
  readonly requestContext?: ManagedExperienceRequestContext;
  readonly initialPlan?: PortableRenderPlan;
  readonly initialError?: Error;
  /** Server-seeded Destination redirect; adopted without a startup fetch. */
  readonly initialRedirect?: ExperienceRedirect;
}

/** One SDK fetch for any selector; Destination selectors may resolve to a redirect. */
export function fetchExperienceRequest(
  sdk: ContentfulExperiences,
  request: ExperienceRequest,
  resolve: FetchResolveOptions,
  currentPage?: Pick<CurrentPageOptions, 'routeKey' | 'isCurrent'>
): Promise<PortableRenderPlan | DestinationRedirectResult> {
  const page = currentPage === undefined ? ([] as const) : ([currentPage] as const);
  if ('experienceId' in request && request.experienceId !== undefined)
    return sdk.fetchExperience(request, resolve, ...page);
  if ('nodeId' in request && request.nodeId !== undefined)
    return sdk.fetchByDestinationNode(request, resolve, ...page);
  return sdk.fetchByDestinationPath(request as FetchByDestinationPathOptions, resolve, ...page);
}

const requestLocale = ({ request, effectiveLocale }: ExperienceSourceOptions): string | undefined =>
  effectiveLocale ?? ('locale' in request ? request.locale : undefined);

/** The Experience whose Preview Session content may update this source. */
function previewExperienceId(
  request: ExperienceRequest,
  data: PortableRenderPlan | undefined
): string | undefined {
  // Destinations have no native preview; session content binds by the resolved id.
  return 'experienceId' in request && request.experienceId !== undefined
    ? request.experienceId
    : data?.experienceId;
}

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

/** Value comparison for immutable descriptors; registries and route revisions use identity. */
export function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left instanceof Date && right instanceof Date)
    return Object.is(left.getTime(), right.getTime());
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

/**
 * View request ownership follows Optimization's OptimizedEntrySourceController at
 * f76f1ff04df1b466c98fc6ce5db6b569f9212438 (MIT). Web owns SDK lifetimes and preview delivery.
 */
export class SourceController {
  private options: ExperienceSourceOptions | undefined;
  private version = 0;
  private active = false;
  private requestStatus: ManagedExperienceSnapshot['status'] = 'idle';
  private listener: ((snapshot: ManagedExperienceSnapshot) => void) | undefined;
  private binding: Subscription | undefined;
  private boundExperienceId: string | undefined;
  private snapshot: ManagedExperienceSnapshot;

  constructor(
    initialPlan?: PortableRenderPlan,
    initialError?: Error,
    initialRedirect?: ExperienceRedirect
  ) {
    this.snapshot = initialRedirect
      ? { status: 'redirect', data: undefined, error: undefined, redirect: initialRedirect }
      : {
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

  updateSupplied(data: PortableRenderPlan | undefined): void {
    if (this.options) this.disconnect();
    this.options = undefined;
    this.active = true;
    this.publish({ status: data ? 'success' : 'idle', data, error: undefined });
  }

  /** Called after commit. Equivalent inline descriptors keep their request and presentation. */
  updateOptions(options: ExperienceSourceOptions): void {
    const previous = this.options;
    const sameDescriptor =
      previous !== undefined &&
      sameValue(previous.seedRequest ?? previous.request, options.seedRequest ?? options.request) &&
      previous.resolve.config === options.resolve.config &&
      sameValue(previous.resolve.metadata ?? {}, options.resolve.metadata ?? {}) &&
      (previous.resolve.debug ?? false) === (options.resolve.debug ?? false) &&
      // Snapshot activation and temporary preview initialization retain caller seeds.
      (!previous.sdk || !options.sdk || requestLocale(previous) === requestLocale(options)) &&
      (!previous.sdk || previous.requestContext?.revision === options.requestContext?.revision);
    const newSeed =
      (options.initialPlan !== undefined ||
        options.initialError !== undefined ||
        options.initialRedirect !== undefined) &&
      (!previous ||
        previous.initialPlan !== options.initialPlan ||
        previous.initialError !== options.initialError ||
        !sameValue(previous.initialRedirect, options.initialRedirect));
    const sdkChanged = previous?.sdk !== options.sdk;
    const changed = !sameDescriptor || sdkChanged || newSeed;
    const reconnect = !this.active;
    this.active = true;
    this.options = options;

    if (changed) {
      this.version++;
      const retain = sameDescriptor && (!previous?.sdk || !sdkChanged);
      if (newSeed && options.initialRedirect) {
        this.requestStatus = 'redirect';
        this.publish({
          status: 'redirect',
          data: undefined,
          error: undefined,
          redirect: options.initialRedirect,
        });
      } else {
        const data = newSeed ? options.initialPlan : retain ? this.snapshot.data : undefined;
        const error = newSeed ? options.initialError : retain ? this.snapshot.error : undefined;
        const redirect = !newSeed && retain ? this.snapshot.redirect : undefined;
        this.requestStatus = redirect ? 'redirect' : error ? 'error' : data ? 'success' : 'idle';
        this.publish({
          status: this.requestStatus,
          data,
          error,
          ...(redirect ? { redirect } : {}),
        });
      }
    }
    if (changed || reconnect) this.unbindPreview();
    this.bindPreview();
    if (options.sdk && this.requestStatus === 'idle') void this.fetch(false);
  }

  /** Bind the one Preview Session stream to this source's current Experience id. */
  private bindPreview(): void {
    const options = this.options;
    const id =
      this.active && options?.sdk && this.snapshot.status !== 'redirect'
        ? previewExperienceId(options.request, this.snapshot.data)
        : undefined;
    if (this.binding && this.boundExperienceId === id) return;
    this.unbindPreview();
    if (!options?.sdk || id === undefined) return;
    this.boundExperienceId = id;
    this.binding = options.sdk.subscribeToPreview(id, options.resolve, (update) => {
      if (update.data) {
        this.version++;
        this.requestStatus = 'success';
      }
      const data = update.data ?? this.snapshot.data;
      this.publish({
        data,
        error: update.error,
        status: update.error ? 'error' : data ? 'success' : this.requestStatus,
      });
    });
  }

  private unbindPreview(): void {
    this.binding?.unsubscribe();
    this.binding = undefined;
    this.boundExperienceId = undefined;
  }

  readonly refresh = async (): Promise<void> => {
    if (this.active && this.options?.sdk) await this.fetch(true);
  };

  readonly retry = (): Promise<void> => this.refresh();

  disconnect(): void {
    this.active = false;
    this.version++;
    if (this.requestStatus === 'loading') this.requestStatus = 'idle';
    this.unbindPreview();
  }

  private currentPreviewError(data = this.snapshot.data): Error | undefined {
    const options = this.options;
    const preview = options?.sdk?.states.preview.current;
    const id = options ? previewExperienceId(options.request, data) : undefined;
    return id !== undefined && preview?.data?.sys?.id === id ? preview?.error : undefined;
  }

  private async fetch(isRefresh: boolean): Promise<void> {
    const options = this.options!;
    const sdk = options.sdk!;
    const version = ++this.version;
    this.requestStatus = 'loading';
    let request = options.request;
    if (isRefresh && request.personalization) {
      const { events: _events, ...personalization } = request.personalization;
      request = { ...request, personalization };
    }
    try {
      this.publish({
        status: 'loading',
        data: this.snapshot.data,
        error: this.currentPreviewError(),
      });
      const result = await (options.requestContext
        ? options.requestContext.fetchExperience(sdk, request, options.resolve, isRefresh)
        : fetchExperienceRequest(sdk, request, options.resolve));
      if (this.version !== version) return;
      if (isDestinationRedirect(result)) {
        // A redirect replaces content; the application decides whether to navigate.
        this.requestStatus = 'redirect';
        this.publish({
          status: 'redirect',
          data: undefined,
          error: undefined,
          redirect: result.redirect,
        });
        this.bindPreview();
        return;
      }
      this.requestStatus = 'success';
      const error = this.currentPreviewError(result);
      this.publish({ status: error ? 'error' : 'success', data: result, error });
      this.bindPreview();
    } catch (error) {
      if (this.version !== version) return;
      this.requestStatus = 'error';
      this.publish({ status: 'error', data: this.snapshot.data, error: toError(error) });
    }
  }

  private publish(snapshot: ManagedExperienceSnapshot): void {
    if (
      snapshot.status === this.snapshot.status &&
      snapshot.data === this.snapshot.data &&
      snapshot.error === this.snapshot.error &&
      sameValue(snapshot.redirect, this.snapshot.redirect)
    )
      return;
    this.snapshot = snapshot;
    this.listener?.(snapshot);
  }
}
