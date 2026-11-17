<script lang="ts">
  import type { Snippet } from 'svelte';

  import { getContentfulExperienceTemplate } from '../../rendering/context.js';
  import { getDesignValues } from '../../hooks/get-design-values.js';

  // A coded Experience Template's slots arrive as named `Snippet[]` props, so
  // the payload's `content` slot lands on a `content` prop — no `children`
  // special case.
  let {
    title,
    content,
  }: {
    title?: string;
    content?: Snippet[];
  } = $props();
  const contentful = getContentfulExperienceTemplate();
  const design = $derived(getDesignValues());
</script>

<main data-experience-template="page" data-title={title} data-bg={design.cfBackground as string}>
  <span data-template-scopes
    >{contentful?.attribution?.scopes.map((scope) => scope.entityId).join(',') ?? ''}</span
  >
  {#each content ?? [] as childSnippet, index (index)}
    {@render childSnippet()}
  {/each}
</main>
