<!--
  Test fixture: proves slot children arrive as an array of Snippets that a
  component can iterate and wrap individually. Also records the received array
  length in the capture sink.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import { getContentfulComponent, getExperience } from '../context.js';
  import { captureSink } from './capture-sink.js';

  let { children }: { children?: Snippet[] } = $props();

  captureSink.push({
    props: { childCount: children?.length ?? 0, childrenIsArray: Array.isArray(children) },
    experience: getExperience(),
    contentful: getContentfulComponent(),
  });
</script>

<div data-container>
  {#each children ?? [] as child, i}
    <div class="wrap" data-index={i}>
      {@render child()}
    </div>
  {/each}
</div>
