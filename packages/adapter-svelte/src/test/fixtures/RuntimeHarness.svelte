<script lang="ts">
  import type { Component } from 'svelte';
  import type { ExperiencesProviderProps, ExperiencesRootProps } from '../../runtime/types.js';
  import type { TransitionConfig } from 'svelte/transition';
  import ExperiencesRoot from '../../runtime/ExperiencesRoot.svelte';
  import ExperiencesProvider from '../../runtime/ExperiencesProvider.svelte';
  import RuntimeProbe from './RuntimeProbe.svelte';
  import type { Config as WebConfig, ContentfulExperiences, ExperiencesSnapshot } from '@contentful/experiences-web';
  import type { OnStatesReady } from '../../runtime/types.js';
  import type { RuntimeProbeCapture } from './runtime-probe.js';
  let { config, Root = ExperiencesRoot, Provider = ExperiencesProvider, sdk, routeKey, snapshot, onStatesReady, capture, initialize, visible = true, flagName = 'test', denyConsent = false, outro }: {
    outro?: (node: Element) => TransitionConfig;
    config: WebConfig;
    Provider?: Component<ExperiencesProviderProps>;
    Root?: Component<ExperiencesRootProps>;
    sdk?: ContentfulExperiences;
    routeKey?: string;
    snapshot?: ExperiencesSnapshot;
    onStatesReady?: OnStatesReady;
    capture?: RuntimeProbeCapture;
    initialize?: () => void;
    visible?: boolean;
    flagName?: string;
    denyConsent?: boolean;
  } = $props();
</script>

{#snippet probe()}{#if visible}<RuntimeProbe {capture} {initialize} {flagName} {denyConsent} />{/if}{/snippet}
{#snippet content()}{#if outro}<div out:outro|global>{@render probe()}</div>{:else}{@render probe()}{/if}{/snippet}
{#if sdk}
  <Provider {sdk} {routeKey} {snapshot} {onStatesReady} children={content} />
{:else}
  <Root {...config} {routeKey} {snapshot} {onStatesReady} children={content} />
{/if}
