import {
  InterceptorManager,
  type EventProfile,
  type OptimizationEventStreamEvent,
} from '@contentful/experiences-runtime';

/** Incoming state available to state interceptors before it is committed. */
export interface ExperienceState {
  readonly profile?: EventProfile;
}

/** Interceptor registries for emitted events and incoming state. */
export interface LifecycleInterceptors {
  event: InterceptorManager<OptimizationEventStreamEvent>;
  state: InterceptorManager<ExperienceState>;
}

/** Merge sparse state, preserving an explicit `undefined` profile clear. */
export function mergeExperienceState(
  previous: Readonly<ExperienceState>,
  next: ExperienceState
): ExperienceState {
  return {
    ...previous,
    ...(Object.prototype.hasOwnProperty.call(next, 'profile') ? { profile: next.profile } : {}),
  };
}
