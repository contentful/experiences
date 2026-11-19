<script lang="ts" module>
  import type { HTMLAttributes } from 'svelte/elements';

  export interface ImageProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
    src?: string;
    alt?: string;
  }
</script>

<script lang="ts">
  let { src, alt = '', style: callerStyle, ...rootProps }: ImageProps = $props();
</script>

{#if src}
  <img
    {src}
    {alt}
    {...rootProps}
    style={`max-width: 100%; height: auto; display: block; ${callerStyle ?? ''}`}
  />
{/if}
