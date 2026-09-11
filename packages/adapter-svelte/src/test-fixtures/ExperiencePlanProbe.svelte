<script lang="ts">
  import type { UseExperiencePlanOptions } from '../use-experience-plan.svelte.js';
  import { useExperiencePlan } from '../use-experience-plan.svelte.js';

  let { options }: { options: UseExperiencePlanOptions } = $props();
  const resolved = useExperiencePlan(() => options);
</script>

<output>{resolved.data?.nodes[0]?.props.content.title ?? ''}</output>
