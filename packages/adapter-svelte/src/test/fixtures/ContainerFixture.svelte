<script lang="ts">
  import type { Snippet } from 'svelte';

  import { getDesignValues } from '../../hooks/get-design-values.js';

  let { children }: { children?: Snippet[] } = $props();
  const design = $derived(getDesignValues());
</script>

<div data-container data-padding={design.cfPadding as string} data-array={Array.isArray(children)} data-count={children?.length ?? 0}>
  {#each children ?? [] as child, i}
    <div class="wrap" data-index={i}>{@render child()}</div>
  {/each}
</div>
