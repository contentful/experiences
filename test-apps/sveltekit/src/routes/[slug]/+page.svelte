<script lang="ts">
  import { ServerExperienceRenderer } from '@contentful/experiences-svelte';

  import { experienceConfig } from '$lib/experience-config.js';

  let { data } = $props();
</script>

<ServerExperienceRenderer
  experience={data.experience}
  config={experienceConfig}
  initialViewportId={data.initialViewportId}
  metadata={{ slug: data.slug }}
  debug={data.debug}
/>
