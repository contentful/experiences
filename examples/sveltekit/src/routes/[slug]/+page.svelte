<script lang="ts">
  import { ServerExperienceRenderer } from '@contentful/experiences-svelte';

  import { experienceConfig } from '$lib/experience-config.js';

  let { data } = $props();
</script>

<!--
  Only `config` is passed alongside the plan: `metadata`, `debug`, and the
  viewport the design was pre-resolved against all travel on the plan itself.
  `config` cannot — it holds component references, which do not serialize.
-->
<ServerExperienceRenderer experience={data.experience} config={experienceConfig} />
