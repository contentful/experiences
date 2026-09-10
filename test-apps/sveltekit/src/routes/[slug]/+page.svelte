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
      initialViewportId: data.initialViewportId,
      metadata: data.metadata,
      debug: data.debug,
    },
  }));
</script>

{#if data.livePreview}
  <ClientExperienceRenderer
    experience={livePreview.data}
    config={experienceConfig}
    initialViewportId={data.initialViewportId}
    metadata={data.metadata}
    debug={data.debug}
  />
{:else}
  <ServerExperienceRenderer
    experience={data.experience}
    config={experienceConfig}
    initialViewportId={data.initialViewportId}
    metadata={data.metadata}
    debug={data.debug}
  />
{/if}
