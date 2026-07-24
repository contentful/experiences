<script lang="ts" module>
  export type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

  export interface HeadingProps {
    text?: string;
  }
</script>

<script lang="ts">
  import { getDesignValues, toCss } from '@contentful/experiences-svelte';

  let { text }: HeadingProps = $props();

  const design = $derived(getDesignValues());
  const tag = $derived<HeadingTag>((design.as as HeadingTag | undefined) ?? 'h2');
  const style = $derived.by(() => {
    const base = 'margin: 0; color: #1f2937';
    const css = toCss(design);
    const cssStr = Object.entries(css)
      .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}: ${v}`)
      .join('; ');
    const align = design.align ? `; text-align: ${design.align}` : '';
    return `${base}${align}${cssStr ? '; ' + cssStr : ''}`;
  });
</script>

<svelte:element this={tag} {style}>{text ?? ''}</svelte:element>
