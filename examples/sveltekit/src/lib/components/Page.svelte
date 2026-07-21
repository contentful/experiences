<!--
  Page-level template. Receives the rendered experience nodes via the
  `children` Snippet and wraps them with the page chrome.
-->
<script lang="ts" module>
  import type { Snippet } from 'svelte';

  export interface PageProps {
    title?: string;
    children: Snippet;
  }
</script>

<script lang="ts">
  let { title, children }: PageProps = $props();
</script>

<main style="display: flex; flex-direction: column; gap: 16px;">
  {#if title}
    <p
      style="max-width: 720px; margin: 40px auto 0; padding: 0 32px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280;"
    >
      {title}
    </p>
  {/if}
  {@render children()}
</main>
