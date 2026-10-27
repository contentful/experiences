import { useState, type CSSProperties } from 'react';

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

/** Interactive: local state only works once Astro hydrates it as an island. */
export function Card({
  title,
  teaser,
  ctaLabel,
  ctaUrl,
  image,
  backgroundColor,
  color,
}: CardProps) {
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const style: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    padding: '1rem 1.25rem',
    borderRadius: '0.5rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    backgroundColor,
    color,
  };
  const clamp: CSSProperties = expanded
    ? {}
    : {
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      };

  return (
    <article style={style}>
      {image && (
        <img src={image} alt="" style={{ width: '100%', height: 180, objectFit: 'cover' }} />
      )}
      <button
        type="button"
        aria-pressed={saved}
        onClick={() => setSaved(!saved)}
        style={{ alignSelf: 'flex-end' }}
      >
        {saved ? '♥ Saved' : '♡ Save'}
      </button>
      {title && <h3 style={{ margin: 0 }}>{title}</h3>}
      {teaser && <p style={{ margin: 0, ...clamp }}>{teaser}</p>}
      {teaser && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          style={{ alignSelf: 'flex-start' }}
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
      {ctaLabel && ctaUrl && (
        <a
          href={ctaUrl}
          style={{
            color: '#fff',
            background: color ?? '#111',
            padding: '0.5rem 1rem',
            alignSelf: 'flex-start',
          }}
        >
          {ctaLabel}
        </a>
      )}
    </article>
  );
}
