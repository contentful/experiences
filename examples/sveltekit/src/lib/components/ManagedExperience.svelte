<script lang="ts">
  import { request } from '$lib/experiences.js';
  import ComponentFallback from './ComponentFallback.svelte';

  const { Experience } = request;
  const current = request.useManagedExperience();
</script>

{#snippet baseline()}
  <section role="status">
    <h1>Contentful Experiences</h1>
    <p>The requested experience is currently unavailable.</p>
    <a href="/">Return to the demo hub</a>
  </section>
{/snippet}

{#if current.result?.notFound}
  <section>
    <h1>Not found</h1>
    <p>The requested experience does not exist.</p>
    <a href="/">Return to the demo hub</a>
  </section>
{:else}
  {#if current.error}
    <p role="status">Content updates are unavailable. Any applicable content remains displayed.</p>
    <button type="button" onclick={() => current.retry()}>Retry content</button>
  {/if}
  <Experience loadingFallback={baseline} errorFallback={baseline} renderError={ComponentFallback} />
{/if}
