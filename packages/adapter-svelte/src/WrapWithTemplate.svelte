<!--
 * Wraps the rendered experience nodes with the page-level template when the
 * plan carries one and the customer registered a template config under that
 * id. When the template is referenced but unregistered, warns once and
 * renders children unwrapped — graceful degradation matches the
 * unknown-component fallback story.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import type { PortableTemplate } from '@contentful/experiences-core';
  import { resolveDesignProperties } from '@contentful/experiences-design';

  import type { ContentfulTemplate, Config, RenderContext } from './types.js';

  interface WrapWithTemplateProps {
    template: PortableTemplate | undefined;
    config: Config;
    experience: RenderContext;
    children: Snippet;
  }

  let { template, config, experience, children }: WrapWithTemplateProps = $props();

  const templateConfig = $derived(
    template ? config.templates?.[template.templateId] : undefined
  );

  $effect(() => {
    if (template && !templateConfig && typeof console !== 'undefined') {
      console.warn(
        `[@contentful/experiences-svelte] No template registered for id "${template.templateId}". Rendering nodes without the template wrapper.`
      );
    }
  });
</script>

{#if template && templateConfig}
  {@const Tpl = templateConfig.component}
  {@const resolvedDesign = resolveDesignProperties(
    template.props.design,
    experience.viewports,
    experience.activeViewportIndex
  )}
  {@const contentful = {
    templateId: template.templateId,
    content: template.props.content,
    design: template.props.design,
    resolved: template.props.resolved,
  } satisfies ContentfulTemplate}
  {@const composedProps = {
    ...templateConfig.defaults,
    ...template.props.content,
    ...resolvedDesign,
    ...template.props.resolved,
    experience,
    contentful,
  }}
  <Tpl {...composedProps} {children} />
{:else}
  {@render children()}
{/if}
