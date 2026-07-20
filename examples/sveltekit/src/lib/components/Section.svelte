<script lang="ts" module>
  import type { Snippet } from 'svelte';

  export interface SectionProps {
    children?: Snippet;
  }
</script>

<script lang="ts">
  import { getDesignValues } from '@contentful/experiences-svelte';

  let { children }: SectionProps = $props();

  const design = $derived(getDesignValues());
  const direction = $derived((design.direction as 'row' | 'column' | undefined) ?? 'column');
  const columns = $derived(design.columns as string | undefined);
  const style = $derived.by(() => {
    const parts: string[] = [];
    if (columns && columns !== 'auto') {
      parts.push('display: grid');
      const tracks = `repeat(${columns}, minmax(0, 1fr))`;
      parts.push(direction === 'column' ? `grid-template-rows: ${tracks}` : `grid-template-columns: ${tracks}`);
    } else {
      parts.push('display: flex');
      parts.push(`flex-direction: ${direction}`);
    }
    if (design.gap) parts.push(`gap: ${design.gap}`);
    if (design.verticalSpacing) parts.push(`padding-block: ${design.verticalSpacing}`);
    if (design.horizontalSpacing) parts.push(`padding-inline: ${design.horizontalSpacing}`);
    if (design.backgroundColor) parts.push(`background: ${design.backgroundColor}`);
    if (design.color) parts.push(`color: ${design.color}`);
    return parts.join('; ');
  });
</script>

<div {style}>
  {#if children}{@render children()}{/if}
</div>
