'use client';

// Adapted from OptimizationProvider activation at
// f76f1ff04df1b466c98fc6ce5db6b569f9212438 (MIT).
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import {
  type ContentfulExperiences,
  createWebSnapshotRuntime,
  type ExperiencesHandoff,
  type ExperiencesSnapshot,
  type Config,
  type CurrentPageOptions,
} from '@contentful/experiences-web';
import {
  assertExperiencesCacheSafety,
  assertExperiencesHandoffScope,
} from '@contentful/experiences-runtime';
import { ExperiencesContext, type ExperiencesContextValue } from './experiences-context.js';
import {
  createExperiencesRootSdkBinding,
  disposeExperiencesRootSdkBinding,
  type ExperiencesRootSdkBinding,
  type OnStatesReady,
} from './experiences-root-sdk-binding.js';
import {
  ExperiencesPageSequence,
  type BeforeInitialPageOptions,
} from './experiences-page-sequence.js';
import { sameValue } from '../experience/experience-source-controller.js';

interface PresentationOptions {
  readonly snapshot?: ExperiencesSnapshot;
  readonly handoff?: ExperiencesHandoff;
  /** Server-transfer identity; a fresh key can admit identical handoff data after reset. */
  readonly handoffKey?: string;
  readonly onStatesReady?: OnStatesReady;
  readonly routeKey?: string;
  readonly buildPagePayload?: CurrentPageOptions['buildPayload'];
  /** Static page arguments; update route-varying values on navigation. The builder takes precedence. */
  readonly initialPagePayload?: Exclude<ReturnType<CurrentPageOptions['buildPayload']>, undefined>;
  readonly beforeInitialPage?: BeforeInitialPageOptions;
}

export type ExperiencesProviderProps = PropsWithChildren<
  PresentationOptions & { readonly sdk: ContentfulExperiences }
>;
export type ExperiencesRootProps = PropsWithChildren<Config & PresentationOptions>;

type ActivationProps = ExperiencesProviderProps | ExperiencesRootProps;
type Target = {
  readonly props: ActivationProps;
  readonly snapshot: ExperiencesContextValue['sdk'];
  readonly initial: ExperiencesContextValue;
};
type ProviderState = ExperiencesContextValue & { readonly target: Target };

const useCommitEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

function createTarget(props: ActivationProps): Target {
  const ownedConfig = 'sdk' in props ? undefined : props;
  const snapshot = createWebSnapshotRuntime(
    props.snapshot ?? {
      data: props.handoff?.state,
      locale: ownedConfig?.locale,
      consent: ownedConfig?.defaults?.consent,
      persistenceConsent: ownedConfig?.defaults?.persistenceConsent,
      allowedEventTypes: ownedConfig?.allowedEventTypes,
    }
  );
  const immediate = 'sdk' in props && props.snapshot === undefined && props.handoff === undefined;
  return {
    props,
    snapshot,
    initial: {
      error: undefined,
      isContentReady: immediate,
      ...(immediate
        ? { sdk: props.sdk, isLive: true as const }
        : { sdk: snapshot, isLive: false as const }),
    },
  };
}

function assertHandoff(handoff: ExperiencesHandoff | undefined, owner: ActivationProps): void {
  if (!handoff) return;
  assertExperiencesCacheSafety(handoff);
  assertExperiencesHandoffScope(handoff, 'sdk' in owner ? owner.sdk : owner);
}

function ActivationProvider(props: ActivationProps) {
  const injectedSdk = 'sdk' in props ? props.sdk : undefined;
  // Structural managed configuration is captured for this mounted owner. Use a key
  // to replace it deliberately; mutable locale uses the existing SDK command.
  const target = useMemo(() => createTarget(props), [injectedSdk]);
  // Validate later handoffs against the actual receiving owner, whose structural
  // configuration stays captured until replacement. No child reads unsafe state.
  assertHandoff(props.handoff, target.props);
  const [state, setState] = useState<ProviderState>(() => ({ ...target.initial, target }));
  const [localeFailure, setLocaleFailure] = useState<{
    sdk: ExperiencesContextValue['sdk'];
    error: Error;
  }>();
  const activeRef = useRef<ExperiencesRootSdkBinding | undefined>(undefined);
  const { target: stateTarget, ...presentation } = state;
  const context = stateTarget === target ? presentation : target.initial;
  const latestHandoff = useRef({ handoff: props.handoff, key: props.handoffKey });
  latestHandoff.current = { handoff: props.handoff, key: props.handoffKey };
  const buildPagePayload = useMemo<CurrentPageOptions['buildPayload'] | undefined>(
    () =>
      props.buildPagePayload ??
      (props.initialPagePayload === undefined ? undefined : () => props.initialPagePayload),
    [props.buildPagePayload, props.initialPagePayload]
  );
  const routeKey =
    props.routeKey ??
    (typeof window === 'undefined' ? '/' : window.location.pathname + window.location.search);
  const [resetRevision, setResetRevision] = useState<object>(() => ({}));
  const operationRevision = useRef(resetRevision);
  const [resetHandoff, setResetHandoff] = useState<typeof latestHandoff.current>();
  const handoff =
    props.handoffKey === resetHandoff?.key && sameValue(props.handoff, resetHandoff?.handoff)
      ? undefined
      : props.handoff;
  const resetRequests = useMemo(
    () => () => {
      const revision = {};
      operationRevision.current = revision;
      setResetHandoff(latestHandoff.current);
      setResetRevision(revision);
    },
    []
  );

  function publishLive(sdk: ContentfulExperiences, isContentReady: boolean, error?: Error) {
    setState({ target, sdk, isLive: true, isContentReady, error });
  }

  useCommitEffect(() => {
    let binding: ExperiencesRootSdkBinding | undefined;
    try {
      const initial = target.props;
      if ('sdk' in initial) {
        binding = createExperiencesRootSdkBinding({
          sdk: initial.sdk,
          onStatesReady: initial.onStatesReady,
        });
      } else {
        const {
          children: _children,
          snapshot: _snapshot,
          handoff: _handoff,
          handoffKey: _handoffKey,
          onStatesReady,
          routeKey: _routeKey,
          buildPagePayload: _buildPagePayload,
          initialPagePayload: _initialPagePayload,
          beforeInitialPage: _beforeInitialPage,
          ...config
        } = initial;
        binding = createExperiencesRootSdkBinding({ config, onStatesReady });
      }
      activeRef.current = binding;
      publishLive(binding.sdk, initial.handoff === undefined);
    } catch (error) {
      setState({
        target,
        sdk: target.snapshot,
        error: toError(error),
        isLive: false,
        isContentReady: true,
      });
    }
    return () => {
      activeRef.current = undefined;
      disposeExperiencesRootSdkBinding(binding);
    };
  }, [target]);

  useCommitEffect(() => {
    const active = activeRef.current;
    if (!active) return;
    if (!handoff) {
      publishLive(active.sdk, true);
      return;
    }
    let cancelled = false;
    const revision = operationRevision.current;
    const isCurrent = () => !cancelled && operationRevision.current === revision;
    publishLive(active.sdk, false);
    // Like Optimization's useAutoPageEmitter, consent changes delegate to the
    // complete SDK operation. The immediate emission starts it after onStatesReady.
    const hydrate = async () => {
      try {
        await active.sdk.hydrateAndTrackCurrentPage(handoff, {
          routeKey,
          buildPayload: buildPagePayload,
          isCurrent,
        });
        if (isCurrent()) publishLive(active.sdk, true);
      } catch (error) {
        if (isCurrent()) publishLive(active.sdk, true, toError(error));
      }
    };
    const subscription = active.sdk.states.consent.subscribe(() => {
      void hydrate();
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [target, handoff, props.handoffKey, routeKey, buildPagePayload, resetRevision]);

  const locale = 'sdk' in props ? undefined : props.locale;
  useCommitEffect(() => {
    const active = activeRef.current;
    if (!active) return;
    const sdk = active.sdk;
    let error: Error | undefined;
    try {
      if (locale !== undefined && sdk.locale !== locale) sdk.setLocale(locale);
    } catch (cause) {
      error = toError(cause);
    }
    // Locale recovery must not clear a still-applicable hydration error, and a
    // hydration result must not erase this command's failure.
    setLocaleFailure(error ? { sdk, error } : undefined);
  }, [target, locale]);

  const error = localeFailure?.sdk === context.sdk ? localeFailure.error : context.error;
  const value = useMemo<ExperiencesContextValue>(() => ({ ...context, error }), [context, error]);
  return (
    <ExperiencesContext.Provider value={value}>
      <ExperiencesPageSequence
        routeKey={routeKey}
        handoff={handoff}
        buildPagePayload={buildPagePayload}
        beforeInitialPage={props.beforeInitialPage}
        resetRevision={resetRevision}
        onReset={resetRequests}
      >
        {props.children}
      </ExperiencesPageSequence>
    </ExperiencesContext.Provider>
  );
}

export function ExperiencesProvider(props: ExperiencesProviderProps) {
  return <ActivationProvider {...props} />;
}

export function ExperiencesRoot(props: ExperiencesRootProps) {
  return <ActivationProvider {...props} />;
}
