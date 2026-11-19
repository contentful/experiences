<script lang="ts">
  import { untrack } from 'svelte';
  import ExperiencePresentation from './ExperiencePresentation.svelte';
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

<ExperiencePresentation {current} {config} {...props} />
