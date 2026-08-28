<script lang="ts">
  import { ServerExperienceRenderer } from '@contentful/experiences-svelte';

  import { experienceConfig } from '$lib/experience-config.js';

  let { data } = $props();
</script>

<!--
  All three render props are optional — the plan already carries what
  `fetchExperience` was given. Shown here to make the override path visible:
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
