<script lang="ts">
  import type { UseLivePreviewExperienceOptions } from '../../hooks/use-live-preview-experience.svelte.js';
  import { useLivePreviewExperience } from '../../hooks/use-live-preview-experience.svelte.js';

  let { options }: { options: UseLivePreviewExperienceOptions } = $props();
  const livePreview = useLivePreviewExperience(() => options);
</script>

<output data-error={livePreview.error?.name ?? ''}>
  {livePreview.data?.nodes[0]?.contentProperties?.title ?? ''}
</output>
