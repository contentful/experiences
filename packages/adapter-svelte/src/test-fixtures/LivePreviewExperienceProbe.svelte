<script lang="ts">
  import type { UseLivePreviewExperienceOptions } from '../use-live-preview-experience.svelte.js';
  import { useLivePreviewExperience } from '../use-live-preview-experience.svelte.js';

  let { options }: { options: UseLivePreviewExperienceOptions } = $props();
  const livePreview = useLivePreviewExperience(() => options);
</script>

<output>{livePreview.data?.nodes[0]?.contentProperties?.title ?? ''}</output>
