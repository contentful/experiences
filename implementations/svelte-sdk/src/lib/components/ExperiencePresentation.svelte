<script lang="ts">
  import type { PortableRenderPlan } from '@contentful/experiences-svelte';
  import { web } from '#lib/experiences.js';
  import RenderError from '#lib/components/RenderError.svelte';
  import UnknownComponent from '#lib/components/UnknownComponent.svelte';
  import { setManualViewTracking } from './manual-view-tracking.js';
  let { experienceId, plan, error, warning, manual = false, repeated = false }: {
    experienceId: string; plan?: PortableRenderPlan; error?: string; warning?: string; manual?: boolean; repeated?: boolean;
  } = $props();
  const { ExperienceRenderer } = web;
  setManualViewTracking(() => manual);
</script>
<section class="experience-presentation" aria-label={`${manual ? 'Manual' : 'Automatic'} Experience ${experienceId}`}>
  <header class="experience-presentation__header"><code>{experienceId}</code>{#if repeated}<span class="entry-card__badge">Repeated plan</span>{/if}</header>
  {#if error}<p role="alert" class="placeholder-card">{error}</p>{/if}
  {#if warning}<p role="status" class="placeholder-card">{warning}</p>{/if}
  {#if plan}
    {#if plan.diagnostics?.length}<p role="status" class="placeholder-card">Some Experience content could not be resolved.</p>{/if}
    {#if plan.deliveryDiagnostics?.length}<p role="status" class="placeholder-card">Some Experience content may be incomplete.</p>{/if}
    {#if !plan.nodes.length}<p class="placeholder-card">The delivered plan has no renderable nodes.</p>{/if}
    <ExperienceRenderer experience={plan} rootProps={manual ? { 'data-ctfl-manual-views': 'true' } : undefined} renderUnknown={UnknownComponent} renderError={RenderError} />
  {:else if !error}
    <p role="status" class="page-loading">Loading Experience…</p>
  {/if}
</section>
