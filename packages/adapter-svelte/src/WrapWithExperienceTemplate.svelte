<!--
 * Wraps the rendered Experience nodes with the page-level Experience Template when the
 * plan carries one and the customer registered an Experience Template config under that
 * id. When the Experience Template is referenced but unregistered, warns once and
 * renders children unwrapped — graceful degradation matches the
 * unknown-component fallback story.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import type { PortableExperienceTemplate } from '@contentful/experiences-sdk-core';
  import { applyTokenResolver, resolveDesignProperties } from '@contentful/experiences-design';

  import { setContentfulExperienceTemplate, setResolvedDesign } from './context.js';
  import {
    normalizeExperienceTemplateRegistration,
    type ContentfulExperienceTemplate,
    type Config,
    type RenderContext,
  } from './types.js';

  interface WrapWithExperienceTemplateProps {
    experienceTemplate: PortableExperienceTemplate | undefined;
    config: Config;
    experience: RenderContext;
    children: Snippet;
  }

  let { experienceTemplate, config, experience, children }: WrapWithExperienceTemplateProps = $props();

  // setContext must run during synchronous component init — call once with
  // the initial value (Experience Templates do not toggle on/off mid-mount).
  if (experienceTemplate) {
    setContentfulExperienceTemplate({
      experienceTemplateId: experienceTemplate.experienceTemplateId,
      content: experienceTemplate.props.content,
      design: experienceTemplate.props.design,
      resolved: experienceTemplate.props.resolved,
    } satisfies ContentfulExperienceTemplate);
  }

  const entry = $derived(experienceTemplate ? config.experienceTemplates?.[experienceTemplate.experienceTemplateId] : undefined);
  const experienceTemplateConfig = $derived(entry ? normalizeExperienceTemplateRegistration(entry) : null);

  const tokenResolvedDesign = $derived.by(() => {
    if (!experienceTemplate) return {};
    const resolvedDesign = resolveDesignProperties(
      experienceTemplate.props.design,
      experience.viewports,
      experience.activeViewportIndex
    );
    const { props, unresolved } = applyTokenResolver(resolvedDesign, config.resolveToken);
    if (unresolved.length && typeof console !== 'undefined') {
      console.warn(
        `[@contentful/experiences-svelte] resolveToken returned undefined for token id(s) on experience template "${experienceTemplate.experienceTemplateId}": ${unresolved.join(', ')}. getDesignValues() will omit those keys.`
      );
    }
    return props;
  });

  // A getter (not a snapshot) so getDesignValues() stays reactive; not merged into props.
  setResolvedDesign(() => tokenResolvedDesign);

  const composed = $derived.by(() => {
    if (!experienceTemplate || !experienceTemplateConfig) return null;
    return {
      ...experienceTemplateConfig.defaults,
      ...experienceTemplate.props.content,
      ...experienceTemplate.props.resolved,
    };
  });

  $effect(() => {
    if (experienceTemplate && !experienceTemplateConfig && typeof console !== 'undefined') {
      console.warn(
        `[@contentful/experiences-svelte] No experience template registered for id "${experienceTemplate.experienceTemplateId}". Rendering nodes without the experience template wrapper.`
      );
    }
  });
</script>

{#if experienceTemplate && experienceTemplateConfig && composed}
  {@const Tpl = experienceTemplateConfig.component}
  <Tpl {...composed} {children} />
{:else}
  {@render children()}
{/if}
