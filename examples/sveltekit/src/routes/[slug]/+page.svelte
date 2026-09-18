<script lang="ts">
  import { ExperienceRenderer, useLivePreview } from '@contentful/experiences-svelte';

  import { experienceConfig } from '$lib/experience-config.js';

  let { data } = $props();

  const livePreview = useLivePreview(() => ({
    previewSessionOptions: data.livePreview ? data.previewSessionOptions : undefined,
    initialPlan: data.experience,
    resolveOptions: {
      config: experienceConfig,
      metadata: data.metadata,
      debug: data.debug,
    },
  }));
</script>

<!--
  Both render props are optional — the plan already carries what
  `fetchExperience` was given. Bound here to show the override path:
  `metadata` merges over the plan's, `debug` replaces it.
-->
{#if data.livePreview}
  <ExperienceRenderer
    experience={livePreview.data}
    config={experienceConfig}
    metadata={data.metadata}
    debug={data.debug}
  />
{:else}
  <ExperienceRenderer
    experience={data.experience}
    config={experienceConfig}
    metadata={{ renderer: 'server' }}
    debug={data.debug}
  />
{/if}
