<script lang="ts">
  import type { ContentfulExperiences, ExperiencesHandoff } from '@contentful/experiences-web';
  import { createExperiences } from '../../experience/create-experiences.js';
  import type { BoundExperienceProps } from '../../experience/presentation-types.js';
  import type { ManagedExperience } from '../../experience/source-types.js';
  import ButtonFixture from './ButtonFixture.svelte';
  import type { ExperiencesProviderProps } from '../../runtime/types.js';
  import HeadingFixture from './HeadingFixture.svelte';
  import ManagedExperienceProbe from './ManagedExperienceProbe.svelte';
  let { sdk, options, handoff, buildPagePayload, routeKey = '/managed', secondary, custom = false, capture, onRedirect }: {
    sdk: ContentfulExperiences;
    options: BoundExperienceProps;
    handoff?: ExperiencesHandoff;
    routeKey?: string;
    buildPagePayload?: ExperiencesProviderProps['buildPagePayload'];
    secondary?: BoundExperienceProps;
    custom?: boolean;
    capture?: (current: ManagedExperience) => void;
    onRedirect?: (redirect: { path: string }) => void;
  } = $props();
  const { ExperiencesProvider, Experience } = createExperiences({
    config: { components: { heading: HeadingFixture, counter: ButtonFixture } },
    onRedirect: (redirect) => onRedirect?.(redirect),
  });
</script>
{#snippet customPresentation(current: ManagedExperience)}<p>Custom {current.status}</p>{/snippet}
<ExperiencesProvider {sdk} {routeKey} {handoff} {buildPagePayload} initialPagePayload={{ properties: { title: 'Managed' } }}>
    <Experience {...options} children={custom ? customPresentation : undefined}>
      {#snippet loadingFallback()}<p>Application loading</p>{/snippet}
      {#snippet errorFallback(current)}<p>{current.result?.notFound ? 'Application content missing' : 'Application error'}</p>{/snippet}
    </Experience>
    {#if secondary}<Experience {...secondary} />{/if}
    <ManagedExperienceProbe {capture} />
</ExperiencesProvider>
