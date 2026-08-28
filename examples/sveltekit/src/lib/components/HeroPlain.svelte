<!--
  Composed hero: title + optional body + CTA + hero image. All content
  properties come from a `Hero from Promotion` DataAssembly binding — this
  component just lays them out and reads its two design properties by name.
-->
<script lang="ts" module>
  export interface HeroPlainProps {
    title?: string;
    body?: unknown;
    ctaLabel?: string;
    ctaUrl?: string;
    image?: string;
    // Design properties, auto-filled as props.
    backgroundColor?: string;
    color?: string;
  }
</script>

<script lang="ts">
  let { title, ctaLabel, ctaUrl, image, backgroundColor, color }: HeroPlainProps = $props();

  const style = $derived(
    [
      'display: grid',
      image ? 'grid-template-columns: 1fr 1fr' : 'grid-template-columns: 1fr',
      'align-items: center',
      'gap: 2rem',
      'padding: 4rem 2rem',
      backgroundColor && `background: ${backgroundColor}`,
      color && `color: ${color}`,
    ]
      .filter(Boolean)
      .join('; ')
  );
</script>

<section {style}>
  <div>
    {#if title}
      <h1 style="margin: 0; font-size: 2.5rem;">{title}</h1>
    {/if}
    {#if ctaLabel && ctaUrl}
      <a
        href={ctaUrl}
        style="display: inline-block; margin-top: 1.5rem; padding: 0.75rem 1.5rem; background: #111; color: #fff; text-decoration: none; border-radius: 0.25rem;"
      >
        {ctaLabel}
      </a>
    {/if}
  </div>
  {#if image}
    <img src={image} alt="" style="max-width: 100%; height: auto; border-radius: 0.5rem;" />
  {/if}
</section>
