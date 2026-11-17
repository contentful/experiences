<script lang="ts">
  import type { Snippet } from 'svelte';

  let { children }: { children?: Snippet[] } = $props();
</script>

<div data-container data-array={Array.isArray(children)} data-count={children?.length ?? 0}>
  {#each children ?? [] as child, i}
    <div class="wrap" data-index={i}>
      {@render child()}
    </div>
  {/each}
</div>
