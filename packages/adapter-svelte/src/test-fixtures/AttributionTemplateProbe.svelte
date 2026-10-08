<!--
  Test fixture: a coded Experience Template that renders its own attributed
  scope ids from `getContentfulExperienceTemplate()`, then its slot children.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import { getContentfulExperienceTemplate } from '../context.js';

  let { content }: { content?: Snippet[] } = $props();
  const contentful = getContentfulExperienceTemplate();
</script>

<main data-template-scopes>
  {contentful?.attribution?.scopes.map((s) => s.entityId).join(',') ?? ''}
  {#each content ?? [] as childSnippet, index (index)}
    {@render childSnippet()}
  {/each}
</main>
