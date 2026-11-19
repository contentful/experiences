<!-- Supplied-plan renderer with server context and diagnostic timing. -->
<script lang="ts">
  import ExperienceRenderer from './ExperienceRenderer.svelte';
  import type { ServerExperienceRendererProps } from './component-props.js';

  let { config, ...props }: ServerExperienceRendererProps = $props();
</script>

<ExperienceRenderer {...props} {config} mode="server" />
