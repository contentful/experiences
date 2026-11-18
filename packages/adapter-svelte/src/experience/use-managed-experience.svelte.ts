import { onDestroy, untrack } from 'svelte';
import type { FetchExperienceOptions } from '@contentful/experiences-web';
import type { Config } from '../registry/types.js';
import { getRuntimeScope } from '../runtime/context.svelte.js';
import type { ManagedExperience, SourceOptions } from './source-types.js';
import type { ExperienceNotifications, UseManagedExperienceOptions } from './presentation-types.js';

/** Registry-bound implementation. A no-argument accessor observes the root's primary source. */
export function useBoundManagedExperience(
  config: Config,
  getOptions?: () => UseManagedExperienceOptions | undefined,
  getDefaults: () => ExperienceNotifications = () => ({})
): ManagedExperience {
  const scope = getRuntimeScope();
  let active = true;
  const options = (raw: UseManagedExperienceOptions): SourceOptions => {
    return {
      request: {
        experienceId: raw.experienceId,
        destinationId: raw.destinationId,
        nodeId: raw.nodeId,
        path: raw.path,
        locale: raw.locale,
        parameters: raw.parameters,
        extensions: raw.extensions,
        personalization: raw.personalization,
      } as FetchExperienceOptions,
      resolve: {
        ...raw.resolveOptions,
        metadata: raw.metadata ?? raw.resolveOptions?.metadata,
        debug: raw.debug ?? raw.resolveOptions?.debug,
        config,
      },
      initialPlan: raw.initialPlan,
      initialError: raw.initialError,
    };
  };
  const getSelection = () => {
    const raw = getOptions?.();
    return raw ? options(raw) : undefined;
  };
  let binding: ReturnType<typeof scope.source.attach> | undefined;
  const synchronize = () => {
    if (!getSelection()) {
      binding?.release();
      binding = undefined;
    } else if (binding) binding.update();
    else binding = scope.source.attach(getSelection);
  };
  // Seeds are available during SSR; browser effects track raw input and source environment.
  untrack(synchronize);
  if (getOptions) $effect.pre(synchronize);
  onDestroy(() => {
    active = false;
    binding?.release();
  });

  const current: ManagedExperience = {
    get status() {
      return scope.source.current.status;
    },
    get data() {
      return scope.source.current.data;
    },
    get error() {
      return scope.source.current.error;
    },
    get redirect() {
      return scope.source.current.redirect;
    },
    get result() {
      return scope.source.current.result;
    },
    retry: () => scope.source.retry(),
    refresh: () => scope.source.refresh(),
  };
  let reported: Pick<ManagedExperience, 'data' | 'error' | 'redirect'> = {
    data: undefined,
    error: undefined,
  };
  $effect(() => {
    const snapshot = scope.source.current;
    const { data, error, redirect } = snapshot;
    const changedData = data !== undefined && reported.data !== data;
    const changedError = error !== undefined && reported.error !== error;
    const changedRedirect = redirect !== undefined && reported.redirect !== redirect;
    untrack(() => {
      const isCurrent = () =>
        active &&
        scope.owner.current.status !== 'disposed' &&
        scope.source.isCurrentSnapshot(snapshot);
      if (!isCurrent()) return;
      reported = { data, error, redirect };
      const defaults = getDefaults();
      const selected = getOptions?.();
      const callbacks = {
        onRedirect: selected?.onRedirect ?? defaults.onRedirect,
        onExperienceResolved: selected?.onExperienceResolved ?? defaults.onExperienceResolved,
        onExperienceError: selected?.onExperienceError ?? defaults.onExperienceError,
      };
      if (changedRedirect && callbacks.onRedirect) {
        if (scope.source.claimRedirect(snapshot)) {
          try {
            callbacks.onRedirect(redirect, current);
          } catch (error) {
            if (isCurrent()) scope.source.rejectRedirect(error);
            return;
          }
        }
      }
      if (!isCurrent()) return;
      if (changedData) callbacks.onExperienceResolved?.({ ...current, data });
      if (isCurrent() && changedError) callbacks.onExperienceError?.(error, current);
    });
  });
  return current;
}

/** Call during component initialization with a getter, or omit it to observe the primary source. */
export function useManagedExperience(
  getOptions?: () => UseManagedExperienceOptions & { config: Config }
): ManagedExperience {
  return useBoundManagedExperience(
    getOptions ? untrack(() => getOptions().config) : { components: {} },
    getOptions
  );
}
