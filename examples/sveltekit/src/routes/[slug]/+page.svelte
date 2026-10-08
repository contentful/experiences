<script lang="ts">
  import {
    ClientExperienceRenderer,
    ServerExperienceRenderer,
    useLivePreview,
  } from '@contentful/experiences-svelte';

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

{#if data.livePreview}
  {#if livePreview.error}
    <p role="status">Live preview is unavailable. Showing the last valid experience.</p>
  {/if}
  <ClientExperienceRenderer
    experience={livePreview.data}
    config={experienceConfig}
    metadata={data.metadata}
    debug={data.debug}
  />
{:else}
<!--
  Both render props are optional — the plan already carries what
  the fetch was given. Shown here to make the override path visible:
  `metadata` merges over the plan's, while `debug` replaces it.
-->
<ServerExperienceRenderer
  experience={data.experience}
  config={experienceConfig}
  metadata={{ renderer: 'server' }}
  debug={data.debug}
/>
{/if}
