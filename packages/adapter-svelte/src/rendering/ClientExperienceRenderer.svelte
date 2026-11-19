<!-- Supplied-plan renderer with client context and diagnostic timing. -->
<script lang="ts">
  import ExperienceRenderer from './ExperienceRenderer.svelte';
  import type { ClientExperienceRendererProps } from './component-props.js';

  let { config, ...props }: ClientExperienceRendererProps = $props();
</script>

<ExperienceRenderer {...props} {config} mode="client" />
