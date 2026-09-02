<script lang="ts">
  import type { UseLivePreviewOptions } from '../use-live-preview.svelte.js';
  import { useLivePreview } from '../use-live-preview.svelte.js';

  let { options }: { options: UseLivePreviewOptions } = $props();
  const livePreview = useLivePreview(() => options);
</script>

<output>{livePreview.data?.nodes[0]?.contentProperties?.title ?? ''}</output>
