<!--
  Coded Experience Template — an ordinary node in the experience. Its slots
  arrive as named `Snippet[]` props, so the payload's `content` slot lands on a
  `content` prop; there is no `children` special case.
-->
<script lang="ts" module>
  import type { HTMLAttributes } from 'svelte/elements';
  import type { Snippet } from 'svelte';

  export interface PageProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
    title?: string;
    content?: Snippet[];
  }
</script>

<script lang="ts">
  let { title, content, style: callerStyle, ...rootProps }: PageProps = $props();
</script>

<main {...rootProps} style={`display: flex; flex-direction: column; gap: 16px; ${callerStyle ?? ''}`}>
  {#if title}
    <p
      style="max-width: 720px; margin: 40px auto 0; padding: 0 32px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280;"
    >
      {title}
    </p>
  {/if}
  {#each content ?? [] as childSnippet, index (index)}
    {@render childSnippet()}
  {/each}
</main>
