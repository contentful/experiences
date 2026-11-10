import {
  type DestinationRedirectResult,
  type PersonalizationOptions,
} from '@contentful/experiences-client';
import {
  assertRuntimePreviewRequest,
  fetchRuntimePreviewSession,
  mergeRuntimePreviewResolveOptions,
  type RuntimeFetchByDestinationNodeOptions,
  type RuntimeFetchByDestinationPathOptions,
  type RuntimeFetchExperienceOptions,
  type RuntimeFetchResolveOptions,
  type RuntimeLivePreviewOptions,
  type RuntimePersonalizationOptions,
} from '@contentful/experiences-runtime';
import type { ExperiencePayload, PortableRenderPlan } from '@contentful/experiences-sdk-core';
import { preview as previewSignal } from '../signals/index.js';
import type { PreviewUpdate } from '../state/states.js';

import { getExperienceSourceKey } from '../content/experience-source-key.js';
import { WebPreview } from '../preview/web-preview.js';
import type { Subscription } from '../signals/index.js';

import { WebFlagRuntime } from '../state/web-flag-runtime.js';
import { InFlightContent } from './in-flight-content.js';
type BuiltFetchOptions<T> = Omit<T, 'personalization'> & {
  personalization?: PersonalizationOptions;
};

/** Fetch and preview operations share the SDK receiver and one in-flight operation owner. */
export abstract class WebContentRuntime extends WebFlagRuntime {
  private readonly inFlight = new InFlightContent();
  protected preview: WebPreview | undefined;
  protected abstract awaitCurrentHandoffIdentity(): Promise<void> | undefined;
  protected abstract withTrackingSourceMap(
    options: RuntimeFetchExperienceOptions
  ): RuntimeFetchExperienceOptions;

  /** Deliver resolved preview updates; the caller retains its existing view state. */
  subscribeToPreview(
    experienceId: string,
    resolveOptions: RuntimeFetchResolveOptions,
    listener: (update: PreviewUpdate) => void
  ): Subscription {
    if (this.destroyed) return { unsubscribe() {} };
    const resolve = mergeRuntimePreviewResolveOptions(this.config, resolveOptions);
    let active = true;
    let previous: ExperiencePayload | undefined;
    let previousError: Error | undefined;
    const subscription = this.states.preview.subscribe((state) => {
      if (!active || this.destroyed) return;
      if (!state || (state.experienceId && state.experienceId !== experienceId)) {
        previous = undefined;
        previousError = undefined;
        return;
      }
      if (state.error && state.error !== previousError) listener({ error: state.error });
      previousError = state.error;
      const data = state.data;
      if (!data) {
        previous = undefined;
        return;
      }
      if (data === previous || state.experienceId !== experienceId) return;
      previous = data;
      const lifetime = this.contentLifetime;
      const stateRevision = this.stateRevision;
      const source = this.preview?.revision;
      const currentSource = () =>
        !this.destroyed &&
        lifetime === this.contentLifetime &&
        source === this.preview?.revision &&
        previewSignal.peek()?.data === data;
      const current = () => active && currentSource();
      const key = getExperienceSourceKey(
        { request: { experienceId }, revision: [lifetime, state.revision] },
        resolve,
        source ?? 0,
        'preview'
      );
      // Unlike resolved snapshots, the preview client emits raw payloads.
      // Resolve streamed content with the caller's registry before publishing a plan.
      void this.inFlight
        .share(key, resolve, async () => {
          const plan = await this.resolveExperience(data, resolveOptions);
          await this.adoptFetchedState(
            plan.personalization,
            () => currentSource() && stateRevision === this.stateRevision,
            false
          );
          return plan;
        })
        .then(
          (plan) => {
            if (!current()) return;
            listener({ data: plan, error: previewSignal.peek()?.error });
          },
          (error: unknown) => {
            if (current())
              listener({ error: error instanceof Error ? error : new Error(String(error)) });
          }
        );
    });
    return {
      unsubscribe: () => {
        active = false;
        subscription.unsubscribe();
      },
    };
  }

  async replaceLivePreview(options: RuntimeLivePreviewOptions): Promise<void> {
    if (this.destroyed) throw new Error('Experiences SDK has been destroyed');
    if (!this.isPreview) throw new Error('Entering preview requires a new Web SDK instance');
    this.contentLifetime++;
    this.inFlight.clear();
    if (this.preview) await this.preview.replace(options);
    else {
      this.preview = new WebPreview(this.config, options);
      await this.preview.ready();
    }
  }

  override async fetchExperience(
    options: RuntimeFetchExperienceOptions,
    resolveOptions: RuntimeFetchResolveOptions
  ): Promise<PortableRenderPlan> {
    const { source, assertCurrent } = this.createFreshnessGuard();
    assertCurrent();
    if (this.preview !== undefined) {
      const preview = await this.fetchPreview(options, resolveOptions, assertCurrent);
      assertCurrent();
      if (preview !== undefined) return preview;
    }
    return this.fetchPersonalized(options, {
      preview: options.preview === true,
      prepare: (current) => this.withTrackingSourceMap(current),
      send: (final) => super.fetchExperience(final, resolveOptions),
      share: (load, final, revision) => {
        const resolve = mergeRuntimePreviewResolveOptions(this.config, resolveOptions);
        const key =
          options.personalization?.events !== undefined
            ? undefined
            : getExperienceSourceKey(
                {
                  request: {
                    ...final,
                    locale: options.locale ?? this.locale,
                    preview: options.preview ?? false,
                  },
                  revision,
                },
                resolve,
                source ?? 0,
                'delivery'
              );
        return this.inFlight.share(key, resolve, load);
      },
    });
  }

  override fetchByDestinationNode(
    options: RuntimeFetchByDestinationNodeOptions,
    resolveOptions: RuntimeFetchResolveOptions
  ): Promise<PortableRenderPlan | DestinationRedirectResult> {
    return this.fetchPersonalized(options, {
      send: (final) => super.fetchByDestinationNode(final, resolveOptions),
    });
  }

  override fetchByDestinationPath(
    options: RuntimeFetchByDestinationPathOptions,
    resolveOptions: RuntimeFetchResolveOptions
  ): Promise<PortableRenderPlan | DestinationRedirectResult> {
    return this.fetchPersonalized(options, {
      send: (final) => super.fetchByDestinationPath(final, resolveOptions),
    });
  }

  private async fetchPersonalized<
    TOptions extends { personalization?: RuntimePersonalizationOptions },
    TResult extends PortableRenderPlan | DestinationRedirectResult,
  >(
    options: TOptions,
    request: {
      preview?: boolean;
      prepare?: (options: TOptions) => TOptions;
      send: (options: BuiltFetchOptions<TOptions>) => Promise<TResult>;
      share?: (
        load: () => Promise<TResult>,
        options: BuiltFetchOptions<TOptions>,
        revision: number[]
      ) => Promise<TResult>;
    }
  ): Promise<TResult> {
    const { generation, assertCurrent } = this.createFreshnessGuard();
    assertCurrent();
    const identityReady = this.awaitCurrentHandoffIdentity();
    if (identityReady !== undefined) {
      await identityReady;
      assertCurrent();
    }
    const stateRevision = this.stateRevision;
    const identityRevision = this.identityRevision;
    const prepared = await this.prepareContentRequest(
      request.prepare?.(options) ?? options,
      assertCurrent
    );
    assertCurrent();
    for (const event of prepared.personalization?.events ?? []) {
      this.publishEvent(event);
      assertCurrent();
    }
    const final = this.withRequestIdentity(prepared);
    assertCurrent();
    const load = async () => {
      const result = await request.send(final);
      assertCurrent();
      if (
        !this.isPreview &&
        (this.stateRevision !== stateRevision || this.identityRevision !== identityRevision)
      )
        throw new Error('Experiences fetch identity was superseded');
      await this.adoptFetchedState(
        'personalization' in result ? result.personalization : undefined,
        () => {
          assertCurrent();
          if (this.stateRevision !== stateRevision || this.identityRevision !== identityRevision)
            throw new Error('Experiences fetch identity was superseded');
          return true;
        },
        !this.isPreview && request.preview !== true
      );
      assertCurrent();
      return result;
    };
    return request.share
      ? request.share(load, final, [generation, stateRevision, identityRevision])
      : load();
  }

  private createFreshnessGuard() {
    const generation = this.contentLifetime;
    const token = this.resetToken;
    const source = this.preview?.revision;
    return {
      generation,
      source,
      assertCurrent: () => {
        if (this.destroyed) throw new Error('Experiences SDK has been destroyed');
        if (
          generation !== this.contentLifetime ||
          (!this.isPreview && token !== this.resetToken) ||
          source !== this.preview?.revision
        )
          throw new Error('Experiences fetch was superseded');
      },
    };
  }

  private async fetchPreview(
    options: RuntimeFetchExperienceOptions,
    resolveOptions: RuntimeFetchResolveOptions,
    assertCurrent: () => void
  ): Promise<PortableRenderPlan | undefined> {
    if (this.preview?.experienceId !== options.experienceId) return undefined;
    const binding = await this.preview.ready();
    assertCurrent();
    assertRuntimePreviewRequest(options);
    this.gatePersonalizationEvents(options);
    assertCurrent();
    const resolve = mergeRuntimePreviewResolveOptions(this.config, resolveOptions);
    const key =
      options.personalization?.events !== undefined
        ? undefined
        : getExperienceSourceKey(
            { request: { experienceId: options.experienceId }, revision: [this.contentLifetime] },
            resolve,
            this.preview?.revision ?? 0,
            'snapshot'
          );
    return this.inFlight.share(key, resolve, async () => {
      const stateRevision = this.stateRevision;
      const previewRevision = previewSignal.peek()?.revision;
      const plan = await fetchRuntimePreviewSession(binding, this.config, resolve);
      // Snapshot HTTP cannot be aborted through the package API; discard obsolete results.
      assertCurrent();
      await this.adoptFetchedState(
        plan.personalization,
        () => {
          assertCurrent();
          return (
            stateRevision === this.stateRevision &&
            previewRevision === previewSignal.peek()?.revision
          );
        },
        false
      );
      assertCurrent();
      return plan;
    });
  }

  private withRequestIdentity<T extends { personalization?: PersonalizationOptions }>(
    options: T
  ): T {
    const profileId = this.isPreview
      ? undefined
      : (options.personalization?.profileId ?? this.requestIdentity());
    return profileId === undefined
      ? options
      : { ...options, personalization: { ...options.personalization, profileId } };
  }
  protected invalidateContent(): void {
    this.contentLifetime += 1;
    this.inFlight.clear();
  }
}
