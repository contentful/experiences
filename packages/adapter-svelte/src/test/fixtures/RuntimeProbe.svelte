<script lang="ts">
  import { untrack } from 'svelte';
  import { getExperiences, getExperiencesActions, getExperiencesState, getRuntimeScope } from '../../runtime/context.svelte.js';
  import type { RuntimeProbeCapture } from './runtime-probe.js';
  let { capture, initialize, flagName = 'test', denyConsent = false }: { capture?: RuntimeProbeCapture; initialize?: () => void; flagName?: string; denyConsent?: boolean } = $props();
  const runtime = getExperiences();
  const state = getExperiencesState();
  const actions = getExperiencesActions();
  const denied = $derived(denyConsent);
  untrack(() => initialize?.());
  const owner = getRuntimeScope().owner;
  const scope = getRuntimeScope();
  untrack(() => capture?.({ runtime, state, actions, owner, scope }));
  $effect(() => { if (state.ready && denied) actions.consent({ events: false }); });
</script>

<p data-runtime>{state.status}|{state.locale}|{state.profile?.id ?? 'neutral'}|{String(state.consent)}|{String(state.flag(flagName))}|{state.error?.message ?? ''}</p>
<p>supplied content</p>
