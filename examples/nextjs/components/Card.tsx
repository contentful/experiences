'use client';

import type { CSSProperties } from 'react';

import { toCss, useDesignValues } from '@contentful/experiences-react';

export interface CardProps {
  title?: string;
  teaser?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  image?: string;
}

/**
 * Compact card: image + title + teaser + CTA. Content properties come from
 * a `Card from Promotion` DataAssembly binding.
 */
export function Card({ title, teaser, ctaLabel, ctaUrl, image }: CardProps) {
  const design = useDesignValues<{
    backgroundColor?: string;
    color?: string;
  }>();

  const style: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    borderRadius: '0.5rem',
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    ...toCss(design),
  };

  return (
    <article style={style}>
      {image && (
        <img
          src={image}
          alt=""
          style={{ width: '100%', height: '180px', objectFit: 'cover' }}
        />
      )}
      <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1 }}>
        {title && <h3 style={{ margin: 0, fontSize: '1.25rem' }}>{title}</h3>}
        {teaser && <p style={{ margin: 0, lineHeight: 1.5 }}>{teaser}</p>}
        {ctaLabel && ctaUrl && (
          <a
            href={ctaUrl}
            style={{
              marginTop: 'auto',
              display: 'inline-block',
              padding: '0.5rem 1rem',
              background: '#111',
              color: '#fff',
              textDecoration: 'none',
              borderRadius: '0.25rem',
              alignSelf: 'flex-start',
            }}
          >
            {ctaLabel}
          </a>
        )}
      </div>
    </article>
  );
}
