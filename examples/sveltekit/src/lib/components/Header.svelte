<script lang="ts" module>
  import type { Snippet } from 'svelte';

  export type HeaderVariant = 'h1' | 'h2' | 'h3';

  export interface HeaderProps {
    text?: string;
    children?: Snippet;
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

  // Design is read through getDesignValues() — the single entry point — not
  // received as injected props. The record carries both the author-defined
  // `variant` (which picks the heading tag; not CSS) and the `cf`-prefixed
  // CSS values. Reading it inside a $derived keeps it reactive across
  // viewport changes; `toCss` keeps only the CSS-shaped keys so `variant`
  // never lands in the style string.
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

{#if variant === 'h1'}
  <h1 {style}>{text}{#if children}{@render children()}{/if}</h1>
{:else if variant === 'h2'}
  <h2 {style}>{text}{#if children}{@render children()}{/if}</h2>
{:else}
  <h3 {style}>{text}{#if children}{@render children()}{/if}</h3>
{/if}
