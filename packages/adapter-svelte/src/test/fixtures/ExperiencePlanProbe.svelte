<script lang="ts">
  import type { UseExperiencePlanOptions } from '../../hooks/use-experience-plan.svelte.js';
  import { useExperiencePlan } from '../../hooks/use-experience-plan.svelte.js';

  let { options }: { options: UseExperiencePlanOptions } = $props();
  const resolved = useExperiencePlan(() => options);
</script>

<output>{resolved.data?.nodes[0]?.props.content.title ?? ''}</output>
