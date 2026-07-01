<script lang="ts">
  import type { Snippet } from 'svelte';
  let {
    cfPadding,
    children,
  }: {
    cfPadding?: string;
    children?: Snippet;
  } = $props();
</script>

<div data-padding={cfPadding}>
  {#if children}{@render children()}{/if}
</div>
