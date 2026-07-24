<!--
  Compact card: image + title + teaser + CTA. Content properties come from
  a `Card from Promotion` DataAssembly binding.
-->
<script lang="ts" module>
  export interface CardProps {
    title?: string;
    teaser?: string;
    ctaLabel?: string;
    ctaUrl?: string;
    image?: string;
  }
</script>

<script lang="ts">
  import { getDesignValues } from '@contentful/experiences-svelte';

  let { title, teaser, ctaLabel, ctaUrl, image }: CardProps = $props();

  const design = $derived(getDesignValues());
  const style = $derived.by(() => {
    const parts = [
      'display: flex',
      'flex-direction: column',
      'border-radius: 0.5rem',
      'overflow: hidden',
      'box-shadow: 0 1px 3px rgba(0,0,0,0.08)',
    ];
    if (design.backgroundColor) parts.push(`background: ${design.backgroundColor}`);
    if (design.color) parts.push(`color: ${design.color}`);
    return parts.join('; ');
  });
</script>

<article {style}>
  {#if image}
    <img src={image} alt="" style="width: 100%; height: 180px; object-fit: cover;" />
  {/if}
  <div style="padding: 1rem 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; flex: 1;">
    {#if title}
      <h3 style="margin: 0; font-size: 1.25rem;">{title}</h3>
    {/if}
    {#if teaser}
      <p style="margin: 0; line-height: 1.5;">{teaser}</p>
    {/if}
    {#if ctaLabel && ctaUrl}
      <a
        href={ctaUrl}
        style="margin-top: auto; display: inline-block; padding: 0.5rem 1rem; background: #111; color: #fff; text-decoration: none; border-radius: 0.25rem; align-self: flex-start;"
      >
        {ctaLabel}
      </a>
    {/if}
  </div>
</article>
