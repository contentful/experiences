<script lang="ts">
  import type { Snippet } from 'svelte';

  import { getDesignValues } from '../get-design-values.js';

  let { children }: { children?: Snippet } = $props();
  const design = $derived(getDesignValues());
</script>

<div data-padding={design.cfPadding as string}>
  {#if children}{@render children()}{/if}
</div>
