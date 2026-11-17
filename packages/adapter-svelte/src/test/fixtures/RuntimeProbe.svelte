<script lang="ts">
  import { untrack } from 'svelte';
  import { getExperiences, getExperiencesActions, getExperiencesState, getRuntimeScope } from '../../runtime/context.svelte.js';
  import type { RuntimeProbeCapture } from './runtime-probe.js';
  import { useLivePreviewExperience } from '../../hooks/use-live-preview-experience.svelte.js';
  let { capture, legacy = false, flagName = 'test', denyConsent = false }: { capture?: RuntimeProbeCapture; legacy?: boolean; flagName?: string; denyConsent?: boolean } = $props();
  const runtime = getExperiences();
  const state = getExperiencesState();
  const actions = getExperiencesActions();
  const denied = $derived(denyConsent);
  if (untrack(() => legacy)) useLivePreviewExperience(() => ({}));
  const owner = getRuntimeScope().owner;
  untrack(() => capture?.({ runtime, state, actions, owner }));
  $effect(() => { if (state.ready && denied) actions.consent({ events: false }); });
</script>

<p data-runtime>{state.status}|{state.locale}|{state.profile?.id ?? 'neutral'}|{String(state.consent)}|{String(state.flag(flagName))}|{state.error?.message ?? ''}</p>
<p>supplied content</p>
