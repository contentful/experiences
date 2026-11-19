<script lang="ts" module>
  import type { HTMLAttributes } from 'svelte/elements';

  export interface ButtonProps extends HTMLAttributes<HTMLAnchorElement | HTMLButtonElement> {
    label?: string;
    url?: string;
    // Design properties, auto-filled as props. `target` is a semantic key (it
    // shapes the markup, not the CSS); the other two are CSS-shaped.
    target?: '_self' | '_blank';
    backgroundColor?: string;
    color?: string;
  }
</script>

<script lang="ts">
  let {
    label = 'Button',
    url,
    target = '_self',
    backgroundColor = '#111',
    color = '#fff',
    style: callerStyle,
    ...rootProps
  }: ButtonProps = $props();

  const style = $derived(
    [
      'display: inline-flex',
      'align-items: center',
      'gap: 6px',
      'padding: 0.75rem 1.5rem',
      'border-radius: 0.25rem',
      'text-decoration: none',
      'font-weight: 500',
      'cursor: pointer',
      `background: ${backgroundColor}`,
      `color: ${color}`,
      callerStyle,
    ]
      .filter(Boolean)
      .join('; ')
  );
</script>

{#if url}
  <a href={url} {target} rel="noopener noreferrer" {...rootProps} {style}>{label}</a>
{:else}
  <button type="button" {...rootProps} {style}>{label}</button>
{/if}
