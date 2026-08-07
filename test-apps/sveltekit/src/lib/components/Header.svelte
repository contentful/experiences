<script lang="ts" module>
  import type { Snippet } from 'svelte';

  export type HeaderVariant = 'h1' | 'h2' | 'h3';

  export interface HeaderProps {
    text?: string;
    // Slot children arrive as an array of Snippets — one per child node — so a
    // component can render them all or map/filter/wrap them individually.
    children?: Snippet[];
  }

  const VARIANT_DEFAULTS: Record<HeaderVariant, { fontSize: string; fontWeight: number; lineHeight: string }> = {
    h1: { fontSize: '32px', fontWeight: 700, lineHeight: '1.2' },
    h2: { fontSize: '24px', fontWeight: 600, lineHeight: '1.3' },
    h3: { fontSize: '20px', fontWeight: 600, lineHeight: '1.35' },
  };

  function toInlineStyle(record: Record<string, string | number>): string {
    return Object.entries(record)
      .map(
        ([k, v]) =>
          `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}: ${v}`
      )
      .join('; ');
  }
</script>

<script lang="ts">
  import { getDesignValues, toCss } from '@contentful/experiences-svelte';

  let { text, children }: HeaderProps = $props();

  // Read in a $derived to stay reactive; `variant` picks the tag, `toCss`
  // keeps the CSS-shaped keys.
  const design = $derived(getDesignValues());
  const variant = $derived((design.variant as HeaderVariant | undefined) ?? 'h2');
  const v = $derived(VARIANT_DEFAULTS[variant]);
  const style = $derived.by(() => {
    const base = `font-size: ${v.fontSize}; font-weight: ${v.fontWeight}; line-height: ${v.lineHeight}; color: #1f2937; margin: 0`;
    const css = toCss(design);
    if (Object.keys(css).length === 0) return base;
    return `${base}; ${toInlineStyle(css)}`;
  });
</script>

{#snippet inner()}{text}{#each children ?? [] as child}{@render child()}{/each}{/snippet}

{#if variant === 'h1'}
  <h1 {style}>{@render inner()}</h1>
{:else if variant === 'h2'}
  <h2 {style}>{@render inner()}</h2>
{:else}
  <h3 {style}>{@render inner()}</h3>
{/if}
