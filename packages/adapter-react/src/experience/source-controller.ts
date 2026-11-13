import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';
import type {
  ContentfulExperiences,
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
  /** Content locale for invalidation, even when Preview transport omits inherited locale. */
  readonly effectiveLocale?: string;
  /** Caller descriptor before inherited locale and ordinary attribution defaults. */
  readonly seedRequest?: FetchExperienceOptions;
  readonly resolve: FetchResolveOptions;
  readonly sdk?: ContentfulExperiences;
  readonly requestContext?: ManagedExperienceRequestContext;
  readonly initialPlan?: PortableRenderPlan;
  readonly initialError?: Error;
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
      (!previous.sdk ||
        !options.sdk ||
        (previous.effectiveLocale ?? previous.request.locale) ===
          (options.effectiveLocale ?? options.request.locale)) &&
      (!previous.sdk || previous.requestContext?.revision === options.requestContext?.revision);
    const newSeed =
      (options.initialPlan !== undefined || options.initialError !== undefined) &&
      (!previous ||
        previous.initialPlan !== options.initialPlan ||
        previous.initialError !== options.initialError);
    const sdkChanged = previous?.sdk !== options.sdk;
    const changed = !sameDescriptor || sdkChanged || newSeed;
    const reconnect = !this.active;
    this.active = true;
    this.options = options;

    if (changed) {
      this.version++;
      const retain = sameDescriptor && (!previous?.sdk || !sdkChanged);
      const data = newSeed ? options.initialPlan : retain ? this.snapshot.data : undefined;
      const error = newSeed ? options.initialError : retain ? this.snapshot.error : undefined;
      this.requestStatus = error ? 'error' : data ? 'success' : 'idle';
      this.publish({ status: this.requestStatus, data, error });
    }
    if (changed || reconnect) {
      this.binding?.unsubscribe();
      this.binding = undefined;
      if (options.sdk) {
        this.binding = options.sdk.subscribeToPreview(
          options.request.experienceId,
          options.resolve,
          (update) => {
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
          }
        );
      }
    }
    if (options.sdk && this.requestStatus === 'idle') void this.fetch(false);
  }

  readonly refresh = async (): Promise<void> => {
    if (this.active && this.options?.sdk) await this.fetch(true);
  };

  readonly retry = (): Promise<void> => this.refresh();

  disconnect(): void {
    this.active = false;
    this.version++;
    if (this.requestStatus === 'loading') this.requestStatus = 'idle';
    this.binding?.unsubscribe();
    this.binding = undefined;
  }

  private currentPreviewError(): Error | undefined {
    const options = this.options;
    const preview = options?.sdk?.states.preview.current;
    return preview?.data?.sys?.id === options?.request.experienceId ? preview?.error : undefined;
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
      this.publish({ ...this.snapshot, status: 'loading', error: this.currentPreviewError() });
      const data = await (options.requestContext
        ? options.requestContext.fetchExperience(sdk, request, options.resolve, isRefresh)
        : sdk.fetchExperience(request, options.resolve));
      if (this.version !== version) return;
      this.requestStatus = 'success';
      const error = this.currentPreviewError();
      this.publish({ status: error ? 'error' : 'success', data, error });
    } catch (error) {
      if (this.version !== version) return;
      this.requestStatus = 'error';
      this.publish({ ...this.snapshot, status: 'error', error: toError(error) });
    }
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
