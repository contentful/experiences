<script lang="ts" module>
  import type { HTMLImgAttributes } from 'svelte/elements';

  export interface ImageProps extends HTMLImgAttributes {
    src?: string;
    alt?: string;
  }
</script>

<script lang="ts">
  let { src, alt = '', style: callerStyle, ...rootProps }: ImageProps = $props();
</script>

{#if src}
  <img
    {...rootProps}
    {src}
    {alt}
    style={['max-width: 100%; height: auto; display: block', callerStyle].filter(Boolean).join('; ')}
  />
{/if}
