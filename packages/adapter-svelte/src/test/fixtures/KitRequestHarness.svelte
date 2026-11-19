<script lang="ts">
  import type { Component, Snippet } from 'svelte';
  import type { ContentfulExperiences } from '@contentful/experiences-web';
  import type { KitExperiencesRootProps, KitExperiencesProviderProps } from '../../kit/client-binding.js';
  import type { ManagedRequestExperience } from '../../kit/request-controller.svelte.js';
  import type { ManagedRequestSource } from '../../kit/request-source.js';
  import RuntimeProbe from './RuntimeProbe.svelte';
  import type { RuntimeProbeCapture } from './runtime-probe.js';
  import type { BoundExperienceProps } from '../../experience/presentation-types.js';
  import ManagedExperienceProbe from './ManagedExperienceProbe.svelte';
  import type { ManagedExperience } from '../../experience/source-types.js';
  let { Root, Provider, sdk, Experience, source, capture, buildPagePayload, WebExperience, webExperienceId, observeRequest, observeWeb }: {
    Root?: Component<KitExperiencesRootProps>;
    Provider?: Component<KitExperiencesProviderProps>;
    sdk?: ContentfulExperiences;
    Experience: Component<{ children?: Snippet<[ManagedRequestExperience]> }>;
    source?: ManagedRequestSource;
    capture?: RuntimeProbeCapture;
    buildPagePayload?: KitExperiencesRootProps['buildPagePayload'];
    WebExperience?: Component<BoundExperienceProps>;
    webExperienceId?: string;
    observeRequest?: (current: ManagedRequestExperience) => void;
    observeWeb?: (current: ManagedExperience) => void;
  } = $props();
</script>
{#snippet content()}
  {#if capture}<RuntimeProbe {capture} />{/if}
  {#if observeWeb}<ManagedExperienceProbe capture={observeWeb} />{/if}
  {#if WebExperience && webExperienceId}
    <WebExperience experienceId={webExperienceId} />
  {/if}
  <Experience>{#snippet children(current)}
    {observeRequest?.(current) ?? ''}
    <p>{current.result?.requestId}|{current.status}|{current.data?.experienceId}|{current.data?.metadata.marker}</p>
    <button onclick={() => void current.retry()}>Retry active content</button>
  {/snippet}</Experience>
{/snippet}
{#if Provider && sdk}
  <Provider {sdk} {source} {buildPagePayload} children={content} />
{:else if Root}
  <Root {source} {buildPagePayload} children={content} />
{/if}
