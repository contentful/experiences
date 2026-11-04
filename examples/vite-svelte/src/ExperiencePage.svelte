<!--
  The client-only flow: the same `fetchExperience` call the SvelteKit example
  makes in its server load function, run in the browser instead. It fetches by
  Destination path (or by Experience id), resolves it, and hands the result to
  `ClientExperienceRenderer`. A Destination redirect node resolves to
  `{ redirect }`, which the browser follows with `location.replace`.

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
    /** Fetch by Destination path. Destination fetches take no `locale`. */
    destinationPath?: string;
    /** Fetch by Experience id. Set exactly one of `destinationPath` and `experienceId`. */
    experienceId?: string;
    locale: string;
    debug: boolean;
  }

  let { destinationPath, experienceId, locale, debug }: Props = $props();

  const experience = $derived.by(() => {
    if (!env.spaceId || !env.accessToken || (destinationPath !== undefined && !env.destinationId)) {
      return Promise.reject(
        new Error(
          'VITE_SPACE_ID, VITE_DESTINATION_ID and VITE_CDA_TOKEN must be set. Copy .env.example to .env.local and fill them in.'
        )
      );
    }
    const resolveOptions = {
      config: experienceConfig,
      metadata: { slug: destinationPath ?? experienceId, locale },
      debug,
    };
    if (destinationPath !== undefined) {
      return fetchExperience(
        { spaceId: env.spaceId, destinationId: env.destinationId, path: destinationPath },
        { accessToken: env.accessToken },
        resolveOptions
      ).then((result) => {
        if ('redirect' in result) {
          window.location.replace(result.redirect.path);
          // The browser is navigating away; keep showing the loading state.
          return new Promise<never>(() => {});
        }
        return result;
      });
    }
    return fetchExperience(
      { spaceId: env.spaceId, environmentId: env.environmentId, experienceId: experienceId!, locale },
      { accessToken: env.accessToken },
      resolveOptions
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
