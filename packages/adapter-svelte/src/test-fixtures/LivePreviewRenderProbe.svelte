<script lang="ts">
  import { ClientExperienceRenderer, useLivePreview, type UseLivePreviewOptions } from '../index.js';
  import InspectionHero from './InspectionHero.svelte';

  let { options }: { options: UseLivePreviewOptions } = $props();
  const livePreview = useLivePreview(() => options);
  const config = { components: { hero: InspectionHero } };
</script>

<ClientExperienceRenderer experience={livePreview.data} {config} />
