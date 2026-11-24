<script lang="ts" module>
  export interface ImageProps {
    src?: string;
    alt?: string;
  }
</script>

<script lang="ts">
  import { getContentfulComponent } from '@contentful/experiences-svelte';

  const contentful = getContentfulComponent();

  let { src, alt = '' }: ImageProps = $props();
</script>

{#if src}
  <img
    data-cf-node-id={contentful?.nodeId}
    {src}
    {alt}
    style="max-width: 100%; height: auto; display: block;"
  />
{/if}
