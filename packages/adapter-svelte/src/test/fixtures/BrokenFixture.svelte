<!-- Throws by default; corrected input exercises native boundary reset. -->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { ComponentErrorProps } from '../../rendering/component-props.js';
  let { fail = true, failure = new Error('boom') }: { fail?: boolean; failure?: unknown } & Partial<ComponentErrorProps> = $props();
  untrack(() => { if (fail) throw failure; });
</script>

<p>Recovered component</p>
