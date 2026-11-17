<script lang="ts">
  import { getDesignValues } from '../../hooks/get-design-values.js';

  let { label }: { label?: string } = $props();
  const design = $derived(getDesignValues());
</script>

<button type="button" data-bg={design.cfBackgroundColor as string}>{label}</button>
