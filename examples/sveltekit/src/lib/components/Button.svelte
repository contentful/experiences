<script lang="ts" module>
  export interface ButtonProps {
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
    ].join('; ')
  );
</script>

{#if url}
  <a href={url} {style} {target} rel="noopener noreferrer">{label}</a>
{:else}
  <button type="button" {style}>{label}</button>
{/if}
