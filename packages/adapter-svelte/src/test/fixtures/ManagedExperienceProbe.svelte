<script lang="ts">
  import { untrack } from 'svelte';
  import { useManagedExperience } from '../../experience/use-managed-experience.svelte.js';
  import type { ManagedExperience } from '../../experience/source-types.js';
  let { capture }: { capture?: (current: ManagedExperience) => void } = $props();
  const current = useManagedExperience();
  untrack(() => capture?.(current));
</script>
<p data-managed>{current.status}|{current.data?.experienceId ?? ''}|{current.error ? 'error' : ''}</p>
