<script lang="ts">
  import type { Component } from 'svelte';
  import type { KitExperiencesRootProps } from '../../kit/client-binding.js';
  let { Root, routeKey = '/' }: { Root: Component<KitExperiencesRootProps>; routeKey?: string } = $props();
</script>

<Root {routeKey}>
  <p>Application baseline</p>
</Root>
