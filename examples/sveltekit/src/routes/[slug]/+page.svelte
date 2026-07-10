<script lang="ts">
  import { ExperienceRenderer } from '@contentful/experiences-svelte';

  import { experienceConfig } from '$lib/experience-config.js';

  let { data } = $props();
</script>

<ExperienceRenderer
  experience={data.experience}
  config={experienceConfig}
  initialViewportId={data.initialViewportId}
  context={{ isPreview: data.previewMode, metadata: { slug: data.slug } }}
  enablePreview
/>
