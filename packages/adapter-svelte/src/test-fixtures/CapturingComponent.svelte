<!--
  Test fixture: pushes its full props plus the current experience /
  contentful context into a module-level `captureSink` that tests pull from.
-->
<script lang="ts">
  import { getExperience, getContentfulComponent } from '../context.js';
  import { getDesignValues } from '../get-design-values.js';
  import { captureSink } from './capture-sink.js';

  // Capture every prop the renderer passes in.
  const rest = $props();
  captureSink.push({
    props: { ...rest },
    experience: getExperience(),
    contentful: getContentfulComponent(),
    designValues: getDesignValues<Record<string, unknown>>(),
  });
</script>
