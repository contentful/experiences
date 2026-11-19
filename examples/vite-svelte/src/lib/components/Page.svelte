<!--
  Coded Experience Template — an ordinary node in the experience. Its slots
  arrive as named `Snippet[]` props, so the payload's `content` slot lands on a
  `content` prop; there is no `children` special case.
-->
<script lang="ts" module>
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  export interface PageProps extends HTMLAttributes<HTMLElement> {
    title?: string;
    content?: Snippet[];
  }
</script>

<script lang="ts">
  let { title, content, style: callerStyle, ...rootProps }: PageProps = $props();
</script>

<main
  {...rootProps}
  style={['display: flex; flex-direction: column; gap: 16px', callerStyle].filter(Boolean).join('; ')}
>
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
