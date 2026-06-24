<script lang="ts" module>
  import type { Snippet } from 'svelte';

  export type HeaderVariant = 'h1' | 'h2' | 'h3';

  export interface HeaderProps {
    text?: string;
    variant?: HeaderVariant;
    children?: Snippet;
  }

  const VARIANT_DEFAULTS: Record<HeaderVariant, { fontSize: string; fontWeight: number; lineHeight: string }> = {
    h1: { fontSize: '32px', fontWeight: 700, lineHeight: '1.2' },
    h2: { fontSize: '24px', fontWeight: 600, lineHeight: '1.3' },
    h3: { fontSize: '20px', fontWeight: 600, lineHeight: '1.35' },
  };
</script>

<script lang="ts">
  let { text, variant = 'h2', children }: HeaderProps = $props();
  const v = $derived(VARIANT_DEFAULTS[variant]);
  const style = $derived(
    `font-size: ${v.fontSize}; font-weight: ${v.fontWeight}; line-height: ${v.lineHeight}; color: #1f2937; margin: 0`
  );
</script>

{#if variant === 'h1'}
  <h1 {style}>{text}{#if children}{@render children()}{/if}</h1>
{:else if variant === 'h2'}
  <h2 {style}>{text}{#if children}{@render children()}{/if}</h2>
{:else}
  <h3 {style}>{text}{#if children}{@render children()}{/if}</h3>
{/if}
