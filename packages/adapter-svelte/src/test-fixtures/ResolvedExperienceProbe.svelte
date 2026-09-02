<script lang="ts">
  import type { UseResolvedExperienceOptions } from '../use-resolved-experience.svelte.js';
  import { useResolvedExperience } from '../use-resolved-experience.svelte.js';

  let { options }: { options: UseResolvedExperienceOptions } = $props();
  const resolved = useResolvedExperience(() => options);
</script>

<output>{resolved.data?.nodes[0]?.props.content.title ?? ''}</output>
