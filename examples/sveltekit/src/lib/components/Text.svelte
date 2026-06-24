<script lang="ts" module>
  import type { Snippet } from 'svelte';

  export interface TextProps {
    value?: string;
    children?: Snippet;
  }
</script>

<script lang="ts">
  let { value, children }: TextProps = $props();
</script>

<p style="font-size: 16px; line-height: 1.5; color: #4b5563; margin: 0;">
  {value}
  {#if children}{@render children()}{/if}
</p>
