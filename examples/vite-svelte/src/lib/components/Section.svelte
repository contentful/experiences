<script lang="ts" module>
  import type { Snippet } from 'svelte';

  export interface SectionProps {
    // Slot children arrive as an array of Snippets — one per child node — so a
    // component can render them all or map/filter/wrap them individually.
    children?: Snippet[];
    // Design properties, auto-filled as props. Declare the ones you consume by
    // name; `direction` and `columns` are semantic keys this component maps onto
    // flex/grid itself, the rest are CSS-shaped.
    direction?: 'row' | 'column';
    columns?: string;
    itemAlign?: string;
    gap?: string;
    verticalSpacing?: string;
    horizontalSpacing?: string;
    backgroundColor?: string;
    color?: string;
  }
</script>

<script lang="ts">
  let {
    children,
    direction = 'column',
    columns,
    gap,
    verticalSpacing,
    horizontalSpacing,
    backgroundColor,
    color,
  }: SectionProps = $props();

  const style = $derived.by(() => {
    const parts: string[] = [];
    if (columns && columns !== 'auto') {
      parts.push('display: grid');
      const tracks = `repeat(${columns}, minmax(0, 1fr))`;
      parts.push(
        direction === 'column' ? `grid-template-rows: ${tracks}` : `grid-template-columns: ${tracks}`
      );
    } else {
      parts.push('display: flex');
      parts.push(`flex-direction: ${direction}`);
    }
    if (gap) parts.push(`gap: ${gap}`);
    if (verticalSpacing) parts.push(`padding-block: ${verticalSpacing}`);
    if (horizontalSpacing) parts.push(`padding-inline: ${horizontalSpacing}`);
    if (backgroundColor) parts.push(`background: ${backgroundColor}`);
    if (color) parts.push(`color: ${color}`);
    return parts.join('; ');
  });
</script>

<div {style}>
  {#each children ?? [] as child}
    {@render child()}
  {/each}
</div>
