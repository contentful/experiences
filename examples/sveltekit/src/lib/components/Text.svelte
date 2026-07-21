<script lang="ts" module>
  export interface TextProps {
    text?: string;
  }
</script>

<script lang="ts">
  import { getDesignValues, toCss } from '@contentful/experiences-svelte';

  let { text }: TextProps = $props();

  const design = $derived(getDesignValues());
  const style = $derived.by(() => {
    const base = 'font-size: 16px; line-height: 1.5; color: #4b5563; margin: 0';
    const css = toCss(design);
    const cssStr = Object.entries(css)
      .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}: ${v}`)
      .join('; ');
    const align = design.align ? `; text-align: ${design.align}` : '';
    return `${base}${align}${cssStr ? '; ' + cssStr : ''}`;
  });
</script>

<p {style}>{text ?? ''}</p>
