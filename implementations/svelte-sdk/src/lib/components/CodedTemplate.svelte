<script lang="ts">
  import { readContent, type TemplateProps } from '#lib/content.js';
  import ContentBody from '#lib/components/ContentBody.svelte';
  import { getManualViewTrackingAttributes } from './manual-view-tracking.js';

  let { title, text, richText, slot, class: className, ...attributes }: TemplateProps = $props();
  const trackingAttributes = getManualViewTrackingAttributes();
  const content = $derived(readContent({ title, text, richText }, 'codedExperienceTemplate'));
</script>

<section
  {...attributes}
  {...trackingAttributes()}
  class={['entry-card', 'entry-card--slotted', className]}
>
  <ContentBody {...content} />
  {#if slot?.length}
    <div class="entry-card__nested-children">
      <span class="entry-card__badge entry-card__badge--slot">Slot: slot</span>
      {#each slot as child, index (index)}
        {@render child()}
      {/each}
    </div>
  {/if}
</section>
