<script lang="ts">
  import {
    useLivePreviewInspection,
    type UseLivePreviewInspectionOptions,
  } from '../index.js';

  let { options, nodeId = 'n' }: {
    options: UseLivePreviewInspectionOptions;
    nodeId?: string;
  } = $props();
  useLivePreviewInspection(() => options);
</script>

<output data-cf-node-id={nodeId}>{nodeId}</output>
