<script lang="ts" module>
  import type { Snippet } from 'svelte';

  export interface TextProps {
    value?: string;
    // Slot children arrive as an array of Snippets — one per child node — so a
    // component can render them all or map/filter/wrap them individually.
    children?: Snippet[];
  }
</script>

<script lang="ts">
  let { value, children }: TextProps = $props();
</script>

<p style="font-size: 16px; line-height: 1.5; color: #4b5563; margin: 0;">
  {value}
  {#each children ?? [] as child}{@render child()}{/each}
</p>
