<!--
 * Hybrid Experience renderer — the one to pick for any route that
 * needs both SSR (for first-paint HTML, SEO, LCP) and client-side
 * interactivity (`enablePreview`, or any other feature exclusive to
 * the client renderer).
 *
 * On the server, and on the very first client render before
 * hydration, emits exactly what `ServerExperienceRenderer` would; on
 * every render after hydration, delegates to
 * `ClientExperienceRenderer`. Svelte 5's `$effect` runs only on the
 * client, so setting a `$state` inside it gives us the two-phase
 * behavior without a hydration mismatch.
 *
 * The three renderers form a clear split:
 *   - `ServerExperienceRenderer` — SSR-only, static HTML, zero client-JS.
 *   - `ClientExperienceRenderer` — client-only; throws on the server.
 *   - `ExperienceRenderer` (this file) — universal. SSR first paint +
 *     client hydration + `enablePreview` in one component.
-->
<script lang="ts">
  import ClientExperienceRenderer from './ClientExperienceRenderer.svelte';
  import ServerExperienceRenderer from './ServerExperienceRenderer.svelte';
  import type { ClientExperienceRendererProps } from './component-props.js';

  const props: ClientExperienceRendererProps = $props();

  // Starts false during SSR and on the pre-hydration client render;
  // flips to true from an $effect (client-only). React idiom is
  // useSyncExternalStore; Svelte's is a $state that $effect owns.
  let isHydrated = $state(false);
  $effect(() => {
    isHydrated = true;
  });
</script>

{#if isHydrated}
  <ClientExperienceRenderer {...props} />
{:else}
  <ServerExperienceRenderer
    experience={props.experience}
    config={props.config}
    initialViewportId={props.initialViewportId}
    context={props.context}
    renderUnknown={props.renderUnknown}
  />
{/if}
