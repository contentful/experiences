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
  type ExperiencesWebConfig,
} from '@contentful/experiences-web';
import {
  assertExperiencesCacheSafety,
  assertExperiencesHandoffScope,
} from '@contentful/experiences-runtime';
import {
  ExperiencesContext,
  type ExperiencesContextValue,
} from '../context/experiences-context.js';
import {
  createExperiencesRootSdkBinding,
  disposeExperiencesRootSdkBinding,
  type ExperiencesRootSdkBinding,
  type OnStatesReady,
} from './experiences-root-sdk-binding.js';

interface PresentationOptions {
  readonly snapshot?: ExperiencesSnapshot;
  readonly handoff?: ExperiencesHandoff;
  readonly onStatesReady?: OnStatesReady;
}

export type ExperiencesProviderProps = PropsWithChildren<
  PresentationOptions & { readonly sdk: ContentfulExperiences }
>;
export type ExperiencesRootProps = PropsWithChildren<ExperiencesWebConfig & PresentationOptions>;

type ActivationProps = ExperiencesProviderProps | ExperiencesRootProps;
type Target = {
  readonly props: ActivationProps;
  readonly snapshot: ExperiencesContextValue['sdk'];
  readonly initial: ExperiencesContextValue;
};
type ProviderState = ExperiencesContextValue & { readonly target: Target };
type ActiveBinding = {
  readonly target: Target;
  readonly binding: ExperiencesRootSdkBinding;
};

const useCommitEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

function createTarget(props: ActivationProps): Target {
  assertHandoff(props.handoff, props);
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
      sdk: immediate ? props.sdk : snapshot,
      error: undefined,
      isLive: immediate,
      isContentReady: immediate,
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
  const activeRef = useRef<ActiveBinding | undefined>(undefined);
  const context = state.target === target ? state : target.initial;
  const handoff = props.handoff;

  function publishLive(active: ActiveBinding, isContentReady: boolean, error?: Error) {
    if (activeRef.current !== active) return;
    setState({
      target: active.target,
      sdk: active.binding.sdk,
      isLive: true,
      isContentReady,
      error,
    });
  }

  useCommitEffect(() => {
    let active: ActiveBinding | undefined;
    try {
      const initial = target.props;
      const binding =
        'sdk' in initial
          ? createExperiencesRootSdkBinding({
              sdk: initial.sdk,
              onStatesReady: initial.onStatesReady,
            })
          : (() => {
              const {
                children: _children,
                snapshot: _snapshot,
                handoff: _handoff,
                onStatesReady,
                ...config
              } = initial;
              return createExperiencesRootSdkBinding({ config, onStatesReady });
            })();
      active = { target, binding };
      activeRef.current = active;
      publishLive(active, initial.handoff === undefined);
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
      if (!active) return;
      if (activeRef.current === active) activeRef.current = undefined;
      disposeExperiencesRootSdkBinding(active.binding);
    };
  }, [target]);

  useCommitEffect(() => {
    const active = activeRef.current;
    if (!active || active.target !== target) return;
    if (!handoff) {
      publishLive(active, true);
      return;
    }
    let cancelled = false;
    const isCurrent = () => !cancelled && activeRef.current === active;
    publishLive(active, false);
    // Like Optimization's useAutoPageEmitter, consent changes delegate to the
    // complete SDK operation. The immediate emission starts it after onStatesReady.
    const subscription = active.binding.sdk.states.consent.subscribe(() => {
      if (!isCurrent()) return;
      try {
        const result = active.binding.sdk.hydrateAndTrackCurrentPage(handoff, {
          routeKey: window.location.pathname + window.location.search,
          isCurrent,
        });
        void Promise.resolve(result).then(
          () => {
            if (isCurrent()) publishLive(active, true);
          },
          (error: unknown) => {
            if (isCurrent()) publishLive(active, true, toError(error));
          }
        );
      } catch (error) {
        if (isCurrent()) publishLive(active, true, toError(error));
      }
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [target, handoff]);

  const locale = 'sdk' in props ? undefined : props.locale;
  useCommitEffect(() => {
    const active = activeRef.current;
    if (!context.isLive || !active || context.sdk !== active.binding.sdk) return;
    let error: Error | undefined;
    try {
      if (locale !== undefined && context.sdk.locale !== locale) context.sdk.setLocale(locale);
    } catch (cause) {
      error = toError(cause);
    }
    // Locale recovery must not clear a still-applicable hydration error, and a
    // hydration result must not erase this command's failure.
    if (activeRef.current === active)
      setLocaleFailure(error ? { sdk: context.sdk, error } : undefined);
  }, [context.isLive, context.sdk, locale]);

  const error = localeFailure?.sdk === context.sdk ? localeFailure.error : context.error;
  const value = useMemo(
    () => ({
      sdk: context.sdk,
      error,
      isLive: context.isLive,
      isContentReady: context.isContentReady,
    }),
    [context.sdk, error, context.isLive, context.isContentReady]
  );
  return <ExperiencesContext.Provider value={value}>{props.children}</ExperiencesContext.Provider>;
}

export function ExperiencesProvider(props: ExperiencesProviderProps) {
  return <ActivationProvider {...props} />;
}

export function ExperiencesRoot(props: ExperiencesRootProps) {
  return <ActivationProvider {...props} />;
}
