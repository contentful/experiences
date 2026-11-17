<script lang="ts">
  import type { Snippet } from 'svelte';

  import { getDesignValues } from '../../hooks/get-design-values.js';

  let { children }: { children?: Snippet[] } = $props();
  const design = $derived(getDesignValues());
</script>

<div data-padding={design.cfPadding as string}>
  {#each children ?? [] as child}
    {@render child()}
  {/each}
</div>
