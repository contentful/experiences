<script lang="ts">
  import type { Component, Snippet } from 'svelte';
  import type { ContentfulExperiences } from '@contentful/experiences-web';
  import type { KitExperiencesRootProps, KitExperiencesProviderProps } from '../../kit/client-binding.js';
  import type { ManagedRequestExperience } from '../../kit/request-controller.svelte.js';
  import type { ManagedRequestSource } from '../../kit/request-source.js';
  import RuntimeProbe from './RuntimeProbe.svelte';
  import type { RuntimeProbeCapture } from './runtime-probe.js';
  let { Root, Provider, sdk, Experience, source, capture }: {
    Root?: Component<KitExperiencesRootProps>;
    Provider?: Component<KitExperiencesProviderProps>;
    sdk?: ContentfulExperiences;
    Experience: Component<{ children?: Snippet<[ManagedRequestExperience]> }>;
    source?: ManagedRequestSource;
    capture?: RuntimeProbeCapture;
  } = $props();
</script>
{#snippet content()}
  {#if capture}<RuntimeProbe {capture} />{/if}
  <Experience>{#snippet children(current)}<p>{current.result?.requestId}|{current.status}|{current.data?.experienceId}</p>{/snippet}</Experience>
{/snippet}
{#if Provider && sdk}
  <Provider {sdk} {source} children={content} />
{:else if Root}
  <Root {source} children={content} />
{/if}
