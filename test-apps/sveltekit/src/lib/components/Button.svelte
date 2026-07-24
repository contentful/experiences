<!--
  Design-system button. Knows nothing about Contentful — it's a plain
  Svelte component the experience-config wires up.
-->
<script lang="ts" module>
  import type { Snippet } from 'svelte';

  export type ButtonType = 'primary' | 'secondary';

  export interface ButtonProps {
    text?: string;
    url?: string;
    type?: ButtonType;
    children?: Snippet;
  }

  const PALETTE: Record<ButtonType, { background: string; color: string; border: string }> = {
    primary: { background: '#4f39f6', color: '#ffffff', border: 'none' },
    secondary: { background: '#ffffff', color: '#1f2937', border: '1px solid #d1d5db' },
  };
</script>

<script lang="ts">
  let { text = 'Button', url, type = 'primary', children }: ButtonProps = $props();
  const palette = $derived(PALETTE[type]);
  const style = $derived(
    [
      'display: inline-flex',
      'align-items: center',
      'gap: 6px',
      'padding: 12px 18px',
      'border-radius: 8px',
      `background: ${palette.background}`,
      `color: ${palette.color}`,
      'font-weight: 500',
      `border: ${palette.border}`,
      'text-decoration: none',
      'cursor: pointer',
    ].join('; ')
  );
</script>

{#if url}
  <a href={url} {style} rel="noopener noreferrer">
    {text}
    {#if children}{@render children()}{/if}
  </a>
{:else}
  <button type="button" {style}>
    {text}
    {#if children}{@render children()}{/if}
  </button>
{/if}
