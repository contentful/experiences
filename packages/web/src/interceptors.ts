import {
  InterceptorManager,
  type EventProfile,
  type ChangeArray,
  type OptimizationEventStreamEvent,
} from '@contentful/experiences-runtime';

/** Incoming state available to state interceptors before it is committed. */
export interface PersonalizationState {
  readonly profile?: EventProfile;
  readonly changes?: ChangeArray;
}

/** Interceptor registries for emitted events and incoming state. */
export interface LifecycleInterceptors {
  event: InterceptorManager<OptimizationEventStreamEvent>;
  state: InterceptorManager<PersonalizationState>;
}

/** Merge sparse state, preserving an explicit `undefined` profile clear. */
export function mergePersonalizationState(
  previous: Readonly<PersonalizationState>,
  next: PersonalizationState
): PersonalizationState {
  return {
    ...previous,
    ...(Object.prototype.hasOwnProperty.call(next, 'profile') ? { profile: next.profile } : {}),
    ...(Object.prototype.hasOwnProperty.call(next, 'changes') ? { changes: next.changes } : {}),
  };
}
