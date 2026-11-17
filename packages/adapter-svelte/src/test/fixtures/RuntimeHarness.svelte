<script lang="ts">
  import type { TransitionConfig } from 'svelte/transition';
  import ExperiencesRoot from '../../runtime/ExperiencesRoot.svelte';
  import ExperiencesProvider from '../../runtime/ExperiencesProvider.svelte';
  import RuntimeProbe from './RuntimeProbe.svelte';
  import type { Config as WebConfig, ContentfulExperiences, ExperiencesSnapshot } from '@contentful/experiences-web';
  import type { OnStatesReady } from '../../runtime/types.js';
  import type { RuntimeProbeCapture } from './runtime-probe.js';
  let { config, sdk, routeKey, snapshot, onStatesReady, capture, legacy = false, visible = true, flagName = 'test', denyConsent = false, outro }: {
    outro?: (node: Element) => TransitionConfig;
    config: WebConfig;
    sdk?: ContentfulExperiences;
    routeKey?: string;
    snapshot?: ExperiencesSnapshot;
    onStatesReady?: OnStatesReady;
    capture?: RuntimeProbeCapture;
    legacy?: boolean;
    visible?: boolean;
    flagName?: string;
    denyConsent?: boolean;
  } = $props();
</script>

{#snippet probe()}{#if visible}<RuntimeProbe {capture} {legacy} {flagName} {denyConsent} />{/if}{/snippet}
{#snippet content()}{#if outro}<div out:outro|global>{@render probe()}</div>{:else}{@render probe()}{/if}{/snippet}
{#if sdk}
  <ExperiencesProvider {sdk} {routeKey} {snapshot} {onStatesReady} children={content} />
{:else}
  <ExperiencesRoot {...config} {routeKey} {snapshot} {onStatesReady} children={content} />
{/if}
