import type {
  FetchExperienceOptions,
  FetchResolveOptions,
  PageViewBuilderArgs,
} from '@contentful/experiences-runtime';
import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';
import type {
  ContentfulExperiences,
  CurrentPageOptions,
  DestinationRedirectResult,
  ExperiencesHandoff,
  Subscription,
} from '@contentful/experiences-web';

export interface PageSequenceOptions {
  readonly routeKey: string;
  readonly initialPagePayload?: PageViewBuilderArgs;
  readonly buildPagePayload?: CurrentPageOptions['buildPayload'];
  readonly handoff?: ExperiencesHandoff;
}

/** Committed host route lifetime; admission, replay history and delivery stay Web-owned. */
export interface PageSequence {
  readonly revision: object;
  readonly routeKey: string;
  isCurrent(): boolean;
  update(options: PageSequenceOptions): void;
  reset(): void;
  abandonPresentation(): void;
  fetchExperience(
    sdk: ContentfulExperiences,
    request: FetchExperienceOptions,
    resolve: FetchResolveOptions,
    isRefresh: boolean,
    isSourceCurrent?: () => boolean
  ): Promise<PortableRenderPlan | DestinationRedirectResult>;
  dispose(): void;
}

type PageIntent = {
  readonly lifetime: () => boolean;
} & (
  | { readonly kind: 'none' }
  | { readonly kind: 'ordinary'; readonly sourceCurrent?: () => boolean }
  | { readonly kind: 'handoff'; readonly handoff: ExperiencesHandoff }
);

interface Visit {
  readonly sdk: ContentfulExperiences | undefined;
  readonly key: string;
  started: boolean;
  intent?: PageIntent;
}

export function createPageSequence(
  getRuntime: () => ContentfulExperiences | undefined
): PageSequence {
  let visit = $state.raw<Visit>({ sdk: undefined, key: '/', started: false });
  let options: PageSequenceOptions = { routeKey: '/' };
  let subscription: Subscription | undefined;
  let disposed = false;
  let initialEmission = true;
  let resetHandoff: ExperiencesHandoff | undefined;

  const buildPayload: CurrentPageOptions['buildPayload'] = (metadata) =>
    options.buildPagePayload ? options.buildPagePayload(metadata) : options.initialPagePayload;
  const hasPayload = () =>
    options.buildPagePayload !== undefined || options.initialPagePayload !== undefined;
  const current = (candidate: Visit) =>
    !disposed &&
    visit === candidate &&
    candidate.sdk !== undefined &&
    getRuntime() === candidate.sdk;
  const currentIntent = (candidate: Visit, intent: PageIntent) =>
    current(candidate) && candidate.intent === intent && intent.lifetime();

  function attemptPage(candidate: Visit) {
    const { sdk, intent } = candidate;
    if (!sdk || !intent || sdk.isPreview || !currentIntent(candidate, intent)) return;
    const isCurrent = () =>
      currentIntent(candidate, intent) &&
      (intent.kind !== 'ordinary' || intent.sourceCurrent?.() !== false);
    if (!isCurrent()) return;
    if (intent.kind === 'handoff') {
      void sdk
        .hydrateAndTrackCurrentPage(intent.handoff, {
          routeKey: candidate.key,
          ...(hasPayload() ? { buildPayload } : {}),
          isCurrent,
        })
        .catch(() => undefined);
    } else if (intent.kind === 'ordinary') {
      void sdk
        .trackCurrentPage({ routeKey: candidate.key, buildPayload, isCurrent })
        .catch(() => undefined);
    }
  }

  return {
    get revision() {
      return visit;
    },
    get routeKey() {
      return visit.key;
    },
    isCurrent() {
      return current(visit);
    },
    update(next) {
      if (disposed) return;
      const sdk = getRuntime();
      const sdkChanged = sdk !== visit.sdk;
      const changed = next.routeKey !== visit.key || sdkChanged;
      const previousHandoff = visit.intent?.kind === 'handoff' ? visit.intent.handoff : undefined;
      const handoff = next.handoff === resetHandoff ? undefined : next.handoff;
      options = next;
      if (changed || handoff !== previousHandoff) {
        const lifetime = changed ? sdk?.captureLifetime() : visit.intent?.lifetime;
        const intent: PageIntent | undefined =
          lifetime &&
          (handoff ? { kind: 'handoff', lifetime, handoff } : { kind: 'none', lifetime });
        if (changed) visit = { sdk, key: next.routeKey, started: false, intent };
        else visit.intent = intent;
      }
      if (sdkChanged) {
        subscription?.unsubscribe();
        subscription = undefined;
        initialEmission = true;
        if (sdk) {
          let previous = sdk.states.consent.current;
          subscription = sdk.states.consent.subscribe((consent) => {
            const granted = consent === true && previous !== true;
            previous = consent;
            if (granted && visit.sdk === sdk) attemptPage(visit);
          });
        }
      }
      if (changed || handoff !== previousHandoff) {
        if (visit.intent?.kind === 'handoff') attemptPage(visit);
      }
    },
    reset() {
      if (disposed) return;
      // Reset ends visitor intent while completed content keeps the same visit.
      if (visit.intent?.kind === 'handoff') resetHandoff = visit.intent.handoff;
      visit.intent = undefined;
      visit.started = true;
      initialEmission = true;
    },
    abandonPresentation() {
      // Redirect ends this operation's page/replay intent, not the committed host route.
      visit.intent = undefined;
    },
    fetchExperience(sdk, request, resolve, isRefresh, isSourceCurrent) {
      const candidate = visit;
      const lifetime = sdk.captureLifetime();
      if (
        candidate.sdk !== sdk ||
        !current(candidate) ||
        !lifetime() ||
        isSourceCurrent?.() === false
      )
        return Promise.reject(new Error('Experiences fetch was superseded'));
      let intent = candidate.intent;
      let fetchOptions = request;
      if (isRefresh) {
        const { personalization, ...selector } = request;
        if (personalization) {
          const { events: _events, ...continuity } = personalization;
          fetchOptions = { ...selector, personalization: continuity };
        }
      } else {
        const initial = !candidate.started;
        candidate.started = true;
        const explicitEvents = request.personalization?.events;
        if (
          initial &&
          candidate.intent?.lifetime() &&
          !sdk.isPreview &&
          !(
            candidate.intent.kind === 'handoff' &&
            candidate.intent.handoff.replay?.routeKey === candidate.key
          ) &&
          explicitEvents === undefined
        ) {
          const payload = buildPayload({ isInitialEmission: initialEmission });
          if (payload !== undefined)
            fetchOptions = {
              ...request,
              personalization: {
                ...request.personalization,
                events: [{ type: 'page', ...payload }],
              },
            };
        }
        const hasPage = fetchOptions.personalization?.events?.some(
          (event) => event.type === 'page'
        );
        if (
          candidate.intent === intent &&
          (intent?.kind !== 'handoff' || (explicitEvents !== undefined && !intent.lifetime()))
        ) {
          // Explicit new work can establish intent after reset; refresh never can.
          if (intent?.kind === 'handoff') resetHandoff = intent.handoff;
          intent = candidate.intent = {
            kind: hasPage ? 'ordinary' : 'none',
            lifetime: hasPage ? lifetime : (intent?.lifetime ?? (() => false)),
            ...(hasPage ? { sourceCurrent: isSourceCurrent } : {}),
          };
        }
        if (hasPage) initialEmission = false;
      }
      return sdk.fetchExperience(fetchOptions, resolve, {
        routeKey: candidate.key,
        isCurrent: () =>
          current(candidate) &&
          lifetime() &&
          (isRefresh || candidate.intent === intent) &&
          isSourceCurrent?.() !== false,
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      subscription?.unsubscribe();
      subscription = undefined;
    },
  };
}
