<script lang="ts">
  import { readContent, type CardProps } from '#lib/content.js';
  import ContentBody from '#lib/components/ContentBody.svelte';
  import { getManualViewTrackingAttributes } from './manual-view-tracking.js';

  let { title, text, richText, class: className, ...attributes }: CardProps = $props();
  const trackingAttributes = getManualViewTrackingAttributes();
  // Failed resolveData can leave original content for the SDK's render fallback.
  const content = $derived(readContent({ title, text, richText }, 'codedComponent'));
</script>

<article {...attributes} {...trackingAttributes()} class={['entry-card', className]}>
  <ContentBody {...content} />
</article>
