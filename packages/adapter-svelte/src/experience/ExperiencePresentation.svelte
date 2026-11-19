<script lang="ts" generics="T">
  import ExperienceRenderer from '../rendering/ClientExperienceRenderer.svelte';
  import type { PresentedExperience } from './presentation.svelte.js';
  import type { PresentationProps } from './presentation-types.js';

  let { current, config, ...props }: PresentationProps<T> & {
    current: PresentedExperience<T>;
  } = $props();
</script>

{#if props.children}
  {@render props.children(current)}
{:else if !current.redirect && current.data}
  <ExperienceRenderer experience={current.data} {config} metadata={props.metadata}
    debug={props.debug} renderUnknown={props.renderUnknown} renderError={props.renderError}
    as={props.as} rootProps={props.rootProps} />
{:else if !current.redirect && current.error}
  {@render props.errorFallback?.(current)}
{:else if !current.redirect}
  {@render props.loadingFallback?.(current)}
{/if}
