<script lang="ts">
  import { untrack } from 'svelte';
  import ExperienceRenderer from '../rendering/ClientExperienceRenderer.svelte';
  import { useBoundManagedExperience } from './use-managed-experience.svelte.js';
  import type { ExperienceProps, UseManagedExperienceOptions } from './presentation-types.js';

  let { config, ...props }: ExperienceProps = $props();
  // A presentation without a selector observes the already selected root primary.
  const current = useBoundManagedExperience(untrack(() => config), () => {
    const selects = props.experienceId !== undefined || props.destinationId !== undefined ||
      props.nodeId !== undefined || props.path !== undefined ||
      props.initialPlan !== undefined || props.initialError !== undefined ||
      props.parameters !== undefined || props.extensions !== undefined ||
      props.personalization !== undefined || props.locale !== undefined || props.resolveOptions !== undefined;
    return selects ? props as UseManagedExperienceOptions : undefined;
  }, () => ({ onRedirect: props.onRedirect, onExperienceResolved: props.onExperienceResolved,
      onExperienceError: props.onExperienceError }));
</script>

{#if props.children}
  {@render props.children(current)}
{:else if !current.redirect && current.data}
  <ExperienceRenderer experience={current.data} {config} metadata={props.metadata}
    debug={props.debug} renderUnknown={props.renderUnknown} renderError={props.renderError}
    as={props.as} rootProps={props.rootProps} />
{:else if !current.redirect && current.error}
  {@render props.errorFallback?.(current)}
{:else if !current.redirect}
  {@render props.loadingFallback?.(current)}
{/if}
