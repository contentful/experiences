import {
  assertPreviewRequest,
  mergePreviewResolveOptions,
  type Config as RuntimeConfig,
  type PreviewSessionOptions,
  type FetchExperienceOptions,
  type FetchByIdExperienceOptions,
  type FetchByDestinationNodeOptions,
  type FetchByDestinationPathOptions,
  type FetchResolveOptions,
  type PersonalizationOptions,
} from '@contentful/experiences-runtime';
import {
  assertExperienceSelector,
  type DestinationRedirectResult,
  type PersonalizationOptions as BuiltPersonalizationOptions,
} from '@contentful/experiences-client';
import type { PortableRenderPlan, ExperiencePayload } from '@contentful/experiences-sdk-core';
import type { Subscription } from '../signals/index.js';
import type { PreviewUpdate } from '../state/states.js';
import type { CurrentPageOptions } from '../sdk/types.js';
import type { InteractionTracking } from '../tracking/interaction-tracking.js';
import type { BuiltFetchOptions } from '../events/fetch-personalization-types.js';
import { WebHandoffRuntime } from '../handoff/web-handoff-runtime.js';
import { publishEvent } from '../events/publication.js';
import { InFlightContent } from './in-flight-content.js';
import { getExperienceSourceKey } from './experience-source-key.js';
import { requireRouteKey } from '../handoff/route-key.js';

/** Ordinary and Preview content share the same state/event receiver. */
export abstract class WebContentRuntime<
  TConfig extends RuntimeConfig,
> extends WebHandoffRuntime<TConfig> {
  protected abstract readonly previewOptions: PreviewSessionOptions | undefined;
  protected abstract ensureInteractionTracking():
    Pick<InteractionTracking, 'hasAutoTracking'> | undefined;
  protected readonly content = new InFlightContent();
  protected previewSnapshot: Promise<{ payload: ExperiencePayload; revision: number }> | undefined;
  #snapshotRevision = 0;

  /** The shared session may update only the Experience identified by its payload. */
  subscribeToPreview(
    experienceId: string,
    resolveOptions: FetchResolveOptions,
    listener: (update: PreviewUpdate) => void
  ): Subscription {
    if (this.destroyed) return { unsubscribe() {} };
    const resolve = mergePreviewResolveOptions(this.config, resolveOptions);
    let active = true;
    let previous: ExperiencePayload | undefined;
    let previousError: Error | undefined;
    const subscription = this.states.preview.subscribe((state) => {
      if (!active || this.destroyed) return;
      const data = state?.data;
      if (!data || typeof data.sys?.id !== 'string' || data.sys.id !== experienceId) {
        previous = undefined;
        previousError = undefined;
        return;
      }
      if (state.error !== previousError) {
        previousError = state.error;
        listener({ error: state.error });
        if (!active || this.destroyed) return;
      }
      if (data === previous) return;
      previous = data;
      const lifetime = this.contentLifetime;
      const stateRevision = this.stateRevision;
      const currentSource = () =>
        !this.destroyed &&
        lifetime === this.contentLifetime &&
        this.previewState.peek()?.data === data;
      if (!currentSource()) return;
      const key = getExperienceSourceKey(
        { request: { experienceId }, revision: [lifetime, state.revision] },
        resolve,
        0,
        'preview'
      );
      void this.content
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
            if (active && currentSource())
              listener({ data: plan, error: this.previewState.peek()?.error });
          },
          (error: unknown) => {
            if (active && currentSource())
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

  #readPreviewSnapshot() {
    if (this.previewSnapshot) return this.previewSnapshot;
    const revision = ++this.#snapshotRevision;
    const pending = super
      .fetchPreviewSessionPayload(this.previewOptions!)
      .then((payload) => ({ payload, revision }))
      .finally(() => {
        if (this.previewSnapshot === pending) this.previewSnapshot = undefined;
      });
    return (this.previewSnapshot = pending);
  }

  override fetchExperience(
    options: FetchByIdExperienceOptions,
    resolveOptions: FetchResolveOptions,
    currentPage?: Pick<CurrentPageOptions, 'routeKey' | 'isCurrent'>
  ): Promise<PortableRenderPlan>;
  override fetchExperience(
    options: FetchExperienceOptions,
    resolveOptions: FetchResolveOptions,
    currentPage?: Pick<CurrentPageOptions, 'routeKey' | 'isCurrent'>
  ): Promise<PortableRenderPlan | DestinationRedirectResult>;
  override async fetchExperience(
    options: FetchExperienceOptions,
    resolveOptions: FetchResolveOptions,
    currentPage?: Pick<CurrentPageOptions, 'routeKey' | 'isCurrent'>
  ): Promise<PortableRenderPlan | DestinationRedirectResult> {
    const { assertCurrent } = this.#createFreshnessGuard();
    assertCurrent();
    assertExperienceSelector(options);
    if (this.previewOptions) {
      const preview = await this.#fetchPreview(options, resolveOptions, assertCurrent);
      assertCurrent();
      if (preview !== undefined) return preview;
    }
    return this.#fetchPersonalized(options, {
      currentPage,
      prepare: (current) => (this.isPreview ? current : this.#withTrackingSourceMap(current)),
      send: async (final) => {
        if (!this.isPreview || final.experienceId !== undefined)
          return super.fetchExperience(final, resolveOptions);
        const acquired = await super.fetchExperiencePayload(final, resolveOptions);
        assertCurrent();
        if ('redirect' in acquired) return acquired;
        if (
          this.environmentId === 'master' &&
          typeof acquired.sys?.id === 'string' &&
          acquired.sys.id.length > 0
        ) {
          const preview = await this.#fetchPreview(
            {
              experienceId: acquired.sys.id,
              locale: options.locale,
              extensions: options.extensions,
              personalization:
                options.personalization?.events === undefined ? undefined : { events: [] },
            },
            resolveOptions,
            assertCurrent
          );
          if (preview !== undefined) return preview;
        }
        return super.resolveExperience(acquired, resolveOptions);
      },
      share: (load, final, revision) => {
        const resolve = mergePreviewResolveOptions(this.config, resolveOptions);
        const key =
          options.personalization?.events !== undefined
            ? undefined
            : getExperienceSourceKey(
                {
                  request: {
                    ...final,
                    locale: options.locale ?? this.locale,
                  },
                  revision,
                },
                resolve,
                0,
                'delivery'
              );
        return this.content.share(key, resolve, load);
      },
    });
  }

  override fetchByDestinationNode(
    options: FetchByDestinationNodeOptions,
    resolveOptions: FetchResolveOptions,
    currentPage?: Pick<CurrentPageOptions, 'routeKey' | 'isCurrent'>
  ): Promise<PortableRenderPlan | DestinationRedirectResult> {
    return this.fetchExperience(options, resolveOptions, currentPage);
  }

  override fetchByDestinationPath(
    options: FetchByDestinationPathOptions,
    resolveOptions: FetchResolveOptions,
    currentPage?: Pick<CurrentPageOptions, 'routeKey' | 'isCurrent'>
  ): Promise<PortableRenderPlan | DestinationRedirectResult> {
    return this.fetchExperience(options, resolveOptions, currentPage);
  }

  async #fetchPersonalized<
    TOptions extends { personalization?: PersonalizationOptions },
    TResult extends PortableRenderPlan | DestinationRedirectResult,
  >(
    options: TOptions,
    request: {
      currentPage?: Pick<CurrentPageOptions, 'routeKey' | 'isCurrent'>;
      prepare?: (options: TOptions) => TOptions;
      send: (options: BuiltFetchOptions<TOptions>) => Promise<TResult>;
      share?: (
        load: () => Promise<TResult>,
        options: BuiltFetchOptions<TOptions>,
        revision: number[]
      ) => Promise<TResult>;
    }
  ): Promise<TResult> {
    const { generation, assertCurrent } = this.#createFreshnessGuard();
    assertCurrent();
    const page = request.currentPage;
    const assertPageCurrent = () => {
      assertCurrent();
      if (page?.isCurrent?.() === false) throw new Error('Experiences fetch was superseded');
    };
    assertPageCurrent();
    if (page) requireRouteKey(page.routeKey);
    const finish =
      page && !this.isPreview ? this.currentPage.prepare(page.routeKey, page.isCurrent) : undefined;
    let profileRevision: number;
    let stateRevision: number;
    let identityRevision: number;
    let prepared: BuiltFetchOptions<TOptions>;
    try {
      const identityReady = this.awaitCurrentHandoffIdentity();
      if (identityReady !== undefined) {
        await identityReady;
        assertPageCurrent();
      }
      profileRevision = this.profileRevision;
      stateRevision = this.stateRevision;
      identityRevision = this.identityRevision;
      prepared = await this.prepareContentRequest(
        request.prepare?.(options) ?? options,
        assertPageCurrent
      );
      assertPageCurrent();
      // Local admission of committing intent precedes publication and transport.
      finish?.(
        prepared.personalization?.preflight !== true &&
          prepared.personalization?.events?.some((event) => event.type === 'page') === true
      );
    } finally {
      finish?.(false);
    }
    for (const event of prepared.personalization?.events ?? []) {
      publishEvent(event);
      assertPageCurrent();
    }
    const final = this.#withRequestIdentity(prepared);
    assertPageCurrent();
    const load = async () => {
      const result = await request.send(final);
      assertCurrent();
      if (
        !this.isPreview &&
        (this.profileRevision !== profileRevision || this.identityRevision !== identityRevision)
      )
        throw new Error('Experiences fetch identity was superseded');
      await this.adoptFetchedState(
        'personalization' in result ? result.personalization : undefined,
        () => {
          assertCurrent();
          if (
            !this.isPreview &&
            (this.profileRevision !== profileRevision || this.identityRevision !== identityRevision)
          )
            throw new Error('Experiences fetch identity was superseded');
          return this.stateRevision === stateRevision;
        }
      );
      assertCurrent();
      return result;
    };
    return request.share
      ? request.share(load, final, [generation, stateRevision, identityRevision])
      : load();
  }

  #createFreshnessGuard() {
    const generation = this.contentLifetime;
    const token = this.resetToken;
    return {
      generation,
      assertCurrent: () => {
        if (this.destroyed) throw new Error('Experiences SDK has been destroyed');
        if (generation !== this.contentLifetime || (!this.isPreview && token !== this.resetToken))
          throw new Error('Experiences fetch was superseded');
      },
    };
  }

  async #fetchPreview(
    options: FetchExperienceOptions,
    resolveOptions: FetchResolveOptions,
    assertCurrent: () => void
  ): Promise<PortableRenderPlan | undefined> {
    if (!this.previewOptions || options.experienceId === undefined) return undefined;
    const { payload, revision } = await this.#readPreviewSnapshot();
    assertCurrent();
    if (typeof payload.sys?.id !== 'string' || payload.sys.id !== options.experienceId)
      return undefined;
    assertPreviewRequest(options);
    this.gatePersonalizationEvents(options);
    assertCurrent();
    const resolve = mergePreviewResolveOptions(this.config, resolveOptions);
    const key =
      options.personalization?.events !== undefined
        ? undefined
        : getExperienceSourceKey(
            {
              request: { experienceId: options.experienceId },
              revision: [this.contentLifetime, revision],
            },
            resolve,
            0,
            'snapshot'
          );
    return this.content.share(key, resolve, async () => {
      const stateRevision = this.stateRevision;
      const previewRevision = this.previewState.peek()?.revision;
      const plan = await this.resolveExperience(payload, resolveOptions);
      // Snapshot HTTP cannot be aborted through the package API; discard obsolete results.
      assertCurrent();
      await this.adoptFetchedState(
        plan.personalization,
        () => {
          assertCurrent();
          return (
            stateRevision === this.stateRevision &&
            previewRevision === this.previewState.peek()?.revision
          );
        },
        false
      );
      assertCurrent();
      return plan;
    });
  }

  #withTrackingSourceMap(options: FetchExperienceOptions): FetchExperienceOptions {
    return options.experienceId !== undefined && this.ensureInteractionTracking()?.hasAutoTracking()
      ? {
          ...options,
          extensions: { ...options.extensions, sourceMap: options.extensions?.sourceMap ?? {} },
        }
      : options;
  }

  #withRequestIdentity<T extends { personalization?: BuiltPersonalizationOptions }>(options: T): T {
    const profileId = this.isPreview
      ? undefined
      : (options.personalization?.profileId ?? this.requestIdentity());
    return profileId === undefined
      ? options
      : { ...options, personalization: { ...options.personalization, profileId } };
  }
}
