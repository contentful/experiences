<script lang="ts" module>
  export interface ImageProps {
    src?: string;
    alt?: string;
  }
</script>

<script lang="ts">
  let { src, alt = '' }: ImageProps = $props();
</script>

{#if src}
  <img {src} {alt} style="max-width: 100%; height: auto; display: block;" />
{/if}
