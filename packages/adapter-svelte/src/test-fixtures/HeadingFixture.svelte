<script lang="ts">
  import { getDesignValues } from '../get-design-values.js';

  let { text }: { text?: string } = $props();
  const design = $derived(getDesignValues());
</script>

<h1 data-font-size={design.cfFontSize as string}>{text}</h1>
