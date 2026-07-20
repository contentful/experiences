'use client';

import type { CSSProperties } from 'react';

import { toCss, useDesignValues } from '@contentful/experiences-react';

export interface HeroPlainProps {
  title?: string;
  body?: unknown; // RichText document; omitted in the DA return for now
  ctaLabel?: string;
  ctaUrl?: string;
  image?: string;
}

/**
 * Composed hero: title + optional body + CTA + hero image. All content
 * properties come from a `Hero from Promotion` DataAssembly binding — this
 * component just lays them out.
 */
export function HeroPlain({ title, ctaLabel, ctaUrl, image }: HeroPlainProps) {
  const design = useDesignValues<{
    backgroundColor?: string;
    color?: string;
  }>();

  const style: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: image ? '1fr 1fr' : '1fr',
    alignItems: 'center',
    gap: '2rem',
    padding: '4rem 2rem',
    ...toCss(design),
  };

  return (
    <section style={style}>
      <div>
        {title && <h1 style={{ margin: 0, fontSize: '2.5rem' }}>{title}</h1>}
        {ctaLabel && ctaUrl && (
          <a
            href={ctaUrl}
            style={{
              display: 'inline-block',
              marginTop: '1.5rem',
              padding: '0.75rem 1.5rem',
              background: '#111',
              color: '#fff',
              textDecoration: 'none',
              borderRadius: '0.25rem',
            }}
          >
            {ctaLabel}
          </a>
        )}
      </div>
      {image && (
        <img
          src={image}
          alt=""
          style={{ maxWidth: '100%', height: 'auto', borderRadius: '0.5rem' }}
        />
      )}
    </section>
  );
}
