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
  import type { TransitionConfig } from 'svelte/transition';
  let { Root, Provider, sdk, Experience, source, capture, WebExperience, actionCycle = 0, action, actionExperienceId = 'primary', observeRequest, observeWeb, outro }: {
    Root?: Component<KitExperiencesRootProps>;
    Provider?: Component<KitExperiencesProviderProps>;
    sdk?: ContentfulExperiences;
    Experience: Component<{ children?: Snippet<[ManagedRequestExperience]> }>;
    source?: ManagedRequestSource;
    capture?: RuntimeProbeCapture;
    WebExperience?: Component<BoundExperienceProps>;
    actionCycle?: number;
    action?: BoundExperienceProps['personalization'];
    actionExperienceId?: string;
    observeRequest?: (current: ManagedRequestExperience) => void;
    observeWeb?: (current: ManagedExperience) => void;
    outro?: (node: Element) => TransitionConfig;
  } = $props();
</script>
{#snippet content()}
  {#if capture}<RuntimeProbe {capture} />{/if}
  {#if observeRequest}
    <Experience>{#snippet children(current)}{observeRequest(current) ?? ''}{/snippet}</Experience>
  {/if}
  {#if observeWeb}<ManagedExperienceProbe capture={observeWeb} />{/if}
  {#if WebExperience && actionCycle}
    {#key actionCycle}
      <WebExperience experienceId={actionExperienceId} personalization={action}>
        {#snippet children(current)}
          {#if outro}<p data-action out:outro|global>{current.status}|{current.data?.metadata.marker}</p>
          {:else}<p data-action>{current.status}|{current.data?.metadata.marker}</p>{/if}
          <button onclick={() => void current.retry()}>Retry active content</button>
        {/snippet}
      </WebExperience>
    {/key}
  {:else}
    <Experience>{#snippet children(current)}<p>{current.result?.requestId}|{current.status}|{current.data?.experienceId}|{current.data?.metadata.marker}</p>{/snippet}</Experience>
  {/if}
{/snippet}
{#if Provider && sdk}
  <Provider {sdk} {source} children={content} />
{:else if Root}
  <Root {source} children={content} />
{/if}
