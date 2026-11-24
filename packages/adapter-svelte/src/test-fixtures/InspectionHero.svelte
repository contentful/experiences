<script lang="ts">
  import { getContentfulComponent } from '../index.js';

  let { title }: { title: string } = $props();
  const contentful = getContentfulComponent();
</script>

<output data-cf-node-id={contentful?.nodeId}>{title}</output>
