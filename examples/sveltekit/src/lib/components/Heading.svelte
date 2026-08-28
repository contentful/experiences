<script lang="ts" module>
  export type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

  export interface HeadingProps {
    text?: string;
    // Design properties, auto-filled as props — already cascaded to the active
    // viewport and token-resolved by the time they arrive.
    as?: HeadingTag;
    align?: string;
    fontSize?: string;
    fontWeight?: string;
  }
</script>

<!--
  The recommended way to style a component: declare the design properties you
  consume as props and read them by name. They arrive resolved, so `as` (a
  semantic key) picks the tag and the CSS-shaped keys go straight into the style
  string. `align` is this design system's shorthand for `text-align`.
-->
<script lang="ts">
  let { text, as: tag = 'h2', align, fontSize, fontWeight }: HeadingProps = $props();

  const style = $derived(
    [
      'margin: 0',
      'color: #1f2937',
      align && `text-align: ${align}`,
      fontSize && `font-size: ${fontSize}`,
      fontWeight && `font-weight: ${fontWeight}`,
    ]
      .filter(Boolean)
      .join('; ')
  );
</script>

<svelte:element this={tag} {style}>{text ?? ''}</svelte:element>
