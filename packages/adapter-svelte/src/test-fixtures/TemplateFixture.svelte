<script lang="ts">
  import type { Snippet } from 'svelte';

  import { getDesignValues } from '../get-design-values.js';

  let {
    title,
    children,
  }: {
    title?: string;
    children: Snippet;
  } = $props();
  const design = $derived(getDesignValues());
</script>

<main data-template="page" data-title={title} data-bg={design.cfBackground as string}>
  {@render children()}
</main>
