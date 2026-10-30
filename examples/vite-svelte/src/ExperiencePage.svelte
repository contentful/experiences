<!--
  The client-only flow: the same `fetchExperience` call the SvelteKit example
  makes in its server load function, run in the browser instead. It fetches
  from the Experience Delivery API, resolves it, and hands the result to
  `ClientExperienceRenderer`.

  What a server would otherwise give you, and what you take on here:
  - The delivery token ships in the bundle (see `lib/env.ts`).
  - Nothing renders until the fetch and resolve finish, so handle loading.
  - Crawlers that don't run JavaScript see an empty page.
-->
<script lang="ts">
  import {
    ClientExperienceRenderer,
    NotFoundError,
    fetchExperience,
  } from '@contentful/experiences-svelte';

  import { env } from './lib/env.js';
  import { experienceConfig } from './lib/experience-config.js';

  interface Props {
    experienceId: string;
    locale: string;
    debug: boolean;
  }

  let { experienceId, locale, debug }: Props = $props();

  const experience = $derived.by(() => {
    if (!env.spaceId || !env.accessToken) {
      return Promise.reject(
        new Error(
          'VITE_SPACE_ID and VITE_CDA_TOKEN must be set. Copy .env.example to .env.local and fill them in.'
        )
      );
    }
    return fetchExperience(
      { spaceId: env.spaceId, environmentId: env.environmentId, experienceId, locale },
      { accessToken: env.accessToken },
      { config: experienceConfig, metadata: { slug: experienceId, locale }, debug }
    );
  });
</script>

{#await experience}
  <p role="status">Loading experience…</p>
{:then resolvedExperience}
  <ClientExperienceRenderer experience={resolvedExperience} config={experienceConfig} {debug} />
{:catch error}
  {#if error instanceof NotFoundError}
    <p role="alert">Experience not found.</p>
  {:else}
    <p role="alert">
      Could not load the experience: {error instanceof Error ? error.message : String(error)}
    </p>
  {/if}
{/await}
