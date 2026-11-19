<script lang="ts">
  import type { Config } from '@contentful/experiences-web';
  import { createExperiences } from '../../experience/create-experiences.js';
  import type { BoundExperienceProps } from '../../experience/presentation-types.js';
  import type { ManagedExperience } from '../../experience/source-types.js';
  import ManagedExperienceProbe from './ManagedExperienceProbe.svelte';
  import HeadingFixture from './HeadingFixture.svelte';

  let { config, options, routeKey = '/managed', custom = false, capture }: {
    config: Config;
    options: BoundExperienceProps;
    routeKey?: string;
    custom?: boolean;
    capture?: (current: ManagedExperience) => void;
  } = $props();
  const { ExperiencesRoot, Experience } = createExperiences({ config: { components: { heading: HeadingFixture } } });
</script>

{#snippet presentation(current: ManagedExperience)}
  <p>{current.status}|{String(current.data?.metadata.title ?? '')}</p>
{/snippet}
<ExperiencesRoot {...config} {routeKey}>
  <Experience {...options} children={custom ? presentation : undefined}>
    {#snippet loadingFallback(current)}<p>Baseline loading {current.status}</p>{/snippet}
    {#snippet errorFallback(current)}<p>Baseline error {current.status}</p>{/snippet}
  </Experience>
  <Experience />
  <ManagedExperienceProbe {capture} />
</ExperiencesRoot>
