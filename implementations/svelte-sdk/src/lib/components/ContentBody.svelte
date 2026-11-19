<script lang="ts">
  import { renderContentRichText, type BoundContent } from '#lib/content.js';

  let { title, text, richText }: BoundContent = $props();
  const html = $derived(renderContentRichText(richText.document));
</script>

<header class="entry-card__header">
  <h3>{title}</h3>
</header>
<p>{text}</p>
<div class="rich-text">
  <!-- The helper validates hyperlink URLs and retains Contentful's text escaping. -->
  {@html html}
</div>
