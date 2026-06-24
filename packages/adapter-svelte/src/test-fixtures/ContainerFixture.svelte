<script lang="ts">
  import type { Snippet } from 'svelte';
  let {
    cfPadding,
    slot,
  }: {
    cfPadding?: string;
    slot?: Snippet<[string]>;
  } = $props();
</script>

<div data-padding={cfPadding}>
  {#if slot}{@render slot('children')}{/if}
</div>
