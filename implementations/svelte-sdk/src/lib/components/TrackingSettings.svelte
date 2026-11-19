<script lang="ts">
  import { getContext, untrack } from 'svelte';
  import { getExperiencesActions, getExperiencesState } from '@contentful/experiences-svelte';
  const controls = getContext<{ automatic: boolean }>('reference-controls');
  const sdkState = getExperiencesState();
  const actions = getExperiencesActions();
  // This child mounts in each owned activation; the retained root keeps the desired UI setting.
  $effect(() => {
    if (!sdkState.ready) return;
    const automatic = controls.automatic;
    untrack(() => {
      for (const type of ['views', 'hovers', 'clicks'] as const)
        if (automatic) actions.tracking.enable(type); else actions.tracking.disable(type);
    });
  });
</script>
