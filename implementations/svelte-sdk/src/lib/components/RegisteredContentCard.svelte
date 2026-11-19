<script lang="ts">
  import { getContentfulComponent } from '@contentful/experiences-svelte';
  import type { CardProps } from '#lib/content.js';
  import ContentCard from '#lib/components/ContentCard.svelte';

  let props: CardProps = $props();
  // Registration-specific Fragment clickability stays outside the design-system card.
  const component = getContentfulComponent();
  const clickable = $derived(
    component?.attribution?.roots.some((scope) => scope.entityKind === 'ExperienceFragment')
  );
</script>

<ContentCard data-ctfl-clickable={clickable ? true : undefined} {...props} />
