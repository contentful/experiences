<script lang="ts">
  import { ServerExperienceRenderer } from '@contentful/experiences-svelte';

  import { experienceConfig } from '$lib/experience-config.js';

  let { data } = $props();
</script>

<!--
  `metadata` and `debug` are optional — the plan already carries what
  `fetchExperience` was given. Passed here to show the render-time override:
  `metadata` merges over the plan's, `debug` replaces it.
-->
<ServerExperienceRenderer
  experience={data.experience}
  config={experienceConfig}
  metadata={{ renderer: 'server' }}
  debug={data.debug}
/>
