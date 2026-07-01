<!--
  Test fixture: pushes its full props + the current experience/contentful
  context into a `capture` array, which tests pull from a module-level
  store. Stripped of the smuggle-through-experience.metadata trick used in
  the old design — context helpers replace it cleanly.
-->
<script lang="ts">
  import { getExperience, getContentfulComponent } from '../context.js';
  import { captureSink } from './capture-sink.js';

  // Capture every prop the renderer passes in.
  const rest = $props();
  captureSink.push({
    props: { ...rest },
    experience: getExperience(),
    contentful: getContentfulComponent(),
  });
</script>
