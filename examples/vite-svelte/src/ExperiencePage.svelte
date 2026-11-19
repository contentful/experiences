<!-- The stable root owns Web fetching, page admission and cleanup. -->
<script lang="ts">
  import type { ManagedExperience } from '@contentful/experiences-svelte';
  import { Experience } from './lib/experiences.js';
  import { env } from './lib/env.js';
  import { scrollAfterContentCommit } from './lib/navigation.svelte.js';

  interface Props {
    /** Destination lookup uses the pathname alone. */
    destinationPath?: string;
    /** Set exactly one of destinationPath and experienceId. */
    experienceId?: string;
    locale: string;
    debug: boolean;
  }

  let { destinationPath, experienceId, locale, debug }: Props = $props();
  const selector = $derived(
    destinationPath !== undefined
      ? { destinationId: env.destinationId, path: destinationPath }
      : { experienceId: experienceId! }
  );
</script>

{#snippet loading()}
  <p role="status">Loading experience…</p>
{/snippet}

{#snippet error(current: ManagedExperience)}
  {#if current.result?.notFound}
    <p role="alert">Experience not found. <a href="/">Return home</a>.</p>
  {:else}
    <p role="alert">Could not load the experience. Please try again later.</p>
  {/if}
{/snippet}

{#if destinationPath !== undefined && !env.destinationId}
  <p role="alert">
    VITE_DESTINATION_ID must be set for Destination routes. Paste the bootstrap's Destination id
    into .env.local.
  </p>
{:else}
  <Experience
    {...selector}
    {locale}
    {debug}
    metadata={{ slug: destinationPath ?? experienceId, locale }}
    loadingFallback={loading}
    errorFallback={error}
    onExperienceResolved={(current) => scrollAfterContentCommit(current.result?.routeKey)}
  />
{/if}
