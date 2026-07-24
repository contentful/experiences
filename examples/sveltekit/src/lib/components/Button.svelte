<script lang="ts" module>
  export interface ButtonProps {
    label?: string;
    url?: string;
  }
</script>

<script lang="ts">
  import { getDesignValues } from '@contentful/experiences-svelte';

  let { label = 'Button', url }: ButtonProps = $props();

  const design = $derived(getDesignValues());
  const style = $derived.by(() => {
    const parts = [
      'display: inline-flex',
      'align-items: center',
      'gap: 6px',
      'padding: 0.75rem 1.5rem',
      'border-radius: 0.25rem',
      'background: #111',
      'color: #fff',
      'text-decoration: none',
      'font-weight: 500',
      'cursor: pointer',
    ];
    if (design.backgroundColor) parts.push(`background: ${design.backgroundColor}`);
    if (design.color) parts.push(`color: ${design.color}`);
    return parts.join('; ');
  });
  const target = $derived((design.target as string | undefined) ?? '_self');
</script>

{#if url}
  <a href={url} {style} {target} rel="noopener noreferrer">{label}</a>
{:else}
  <button type="button" {style}>{label}</button>
{/if}
