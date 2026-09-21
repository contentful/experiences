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
  {#if livePreview.error}
    <p role="status">Live preview is unavailable. Showing the last valid experience.</p>
  {/if}
  <ClientExperienceRenderer
    experience={livePreview.data}
    config={experienceConfig}
    initialViewportId={data.initialViewportId}
    metadata={data.metadata}
    debug={data.debug}
  />
{:else}
<!--
  All three render props are optional — the plan already carries what
  the fetch was given. Shown here to make the override path visible:
  `metadata` merges over the plan's, `debug` and `initialViewportId` replace it.
  Passing the fetch's own viewport is a no-op; the prop earns its place when you
  want a different one.
-->
<ServerExperienceRenderer
  experience={data.experience}
  config={experienceConfig}
  initialViewportId={data.initialViewportId}
  metadata={{ renderer: 'server' }}
  debug={data.debug}
/>
{/if}
