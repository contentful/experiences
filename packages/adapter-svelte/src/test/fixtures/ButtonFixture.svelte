<script lang="ts">
  import { getDesignValues } from '../../hooks/get-design-values.js';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  let { label, ...rest }: HTMLButtonAttributes & { label?: string } = $props();
  let count = $state(0);
  const design = $derived(getDesignValues());
</script>

<button {...rest} type="button" data-bg={design.cfBackgroundColor as string} onclick={() => count += 1}>{label ?? `Retained count ${count}`}</button>
