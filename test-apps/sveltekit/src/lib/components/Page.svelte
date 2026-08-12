<!--
  Coded Experience Template — an ordinary node in the experience. Its slots
  arrive as named `Snippet[]` props, so the payload's `content` slot lands on a
  `content` prop; there is no `children` special case.
-->
<script lang="ts" module>
  import type { Snippet } from 'svelte';

  export interface PageProps {
    title?: string;
    content?: Snippet[];
  }
</script>

<script lang="ts">
  let { title, content }: PageProps = $props();
</script>

<main
  style="max-width: 720px; margin: 40px auto; padding: 32px; background: #ffffff; border-radius: 16px; border: 1px solid #e5e7eb; display: flex; flex-direction: column; gap: 16px;"
>
  {#if title}
    <p
      style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; margin: 0;"
    >
      {title}
    </p>
  {/if}
  {#each content ?? [] as childSnippet, index (index)}
    {@render childSnippet()}
  {/each}
</main>
