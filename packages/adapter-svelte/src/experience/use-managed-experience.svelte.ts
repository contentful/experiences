import { onDestroy, untrack } from 'svelte';
import { usePresentation } from './presentation.svelte.js';
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
  // Seeds are synchronous; fresh browser acquisition follows the committed selecting view.
  const initial = untrack(getSelection);
  if (
    typeof window === 'undefined' ||
    initial?.initialPlan !== undefined ||
    initial?.initialError !== undefined
  )
    untrack(synchronize);
  if (getOptions) $effect(synchronize);
  onDestroy(() => {
    binding?.release();
  });

  return usePresentation(
    scope.presentation,
    () => {
      const defaults = getDefaults();
      const selected = getOptions?.();
      return {
        onRedirect: selected?.onRedirect ?? defaults.onRedirect,
        onExperienceResolved: selected?.onExperienceResolved ?? defaults.onExperienceResolved,
        onExperienceError: selected?.onExperienceError ?? defaults.onExperienceError,
      };
    },
    (result) => (result && 'request' in result ? result : undefined)
  );
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
