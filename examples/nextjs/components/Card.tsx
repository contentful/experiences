'use client';

import type { CSSProperties } from 'react';

import { useDesignValues } from '@contentful/experiences-react';

export interface CardProps {
  title?: string;
  teaser?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  image?: string;
  // Design properties, auto-filled as props.
  backgroundColor?: string;
  color?: string;
}

/**
 * Compact card: image + title + teaser + CTA. Content properties come from
 * a `Card from Promotion` DataAssembly binding. The card itself styles from
 * props, like every other component here.
 *
 * This file is also the example app's one demonstration of the
 * `useDesignValues()` escape hatch — see `CardCta` below.
 */
export function Card({
  title,
  teaser,
  ctaLabel,
  ctaUrl,
  image,
  backgroundColor,
  color,
}: CardProps) {
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    borderRadius: '0.5rem',
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    backgroundColor,
    color,
  };

  return (
    <article style={style}>
      {image && (
        <img src={image} alt="" style={{ width: '100%', height: '180px', objectFit: 'cover' }} />
      )}
      <div
        style={{
          padding: '1rem 1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          flex: 1,
        }}
      >
        {title && <h3 style={{ margin: 0, fontSize: '1.25rem' }}>{title}</h3>}
        {teaser && <p style={{ margin: 0, lineHeight: 1.5 }}>{teaser}</p>}
        {ctaLabel && ctaUrl && <CardCta label={ctaLabel} url={ctaUrl} />}
      </div>
    </article>
  );
}

/**
 * The escape hatch, and the one case props can't cover: `CardCta` is a nested
 * presentational child, not a registered component, so the SDK has no props to
 * auto-fill onto it. `useDesignValues()` reads the resolved design record of the
 * nearest registered ancestor (the `Card`) off context, which lets the CTA tint
 * itself with the card's own `color` without `Card` threading it down by hand.
 *
 * Reach for this only here or when you need design outside the render path (an
 * effect, an imperative measurement). Registered components should style from
 * props — see every other component in this directory.
 */
function CardCta({ label, url }: { label: string; url: string }) {
  const { color } = useDesignValues<{ color?: string }>();

  return (
    <a
      href={url}
      style={{
        marginTop: 'auto',
        display: 'inline-block',
        padding: '0.5rem 1rem',
        background: color ?? '#111',
        color: '#fff',
        textDecoration: 'none',
        borderRadius: '0.25rem',
        alignSelf: 'flex-start',
      }}
    >
      {label}
    </a>
  );
}
