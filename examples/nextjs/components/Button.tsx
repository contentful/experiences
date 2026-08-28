'use client';

import type { CSSProperties } from 'react';

export interface ButtonProps {
  label?: string;
  url?: string | null;
  // Design properties, auto-filled as props. `target` is a semantic key (it
  // shapes the markup, not the CSS); the other two are CSS-shaped.
  target?: '_self' | '_blank';
  backgroundColor?: string;
  color?: string;
}

export function Button({
  label,
  url,
  target = '_self',
  backgroundColor = '#4f39f6',
  color = '#ffffff',
}: ButtonProps) {
  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '12px 18px',
    borderRadius: 8,
    background: backgroundColor,
    color,
    fontWeight: 500,
    border: 'none',
    textDecoration: 'none',
    cursor: 'pointer',
  };

  const content = <>{label ?? 'Button'}</>;

  if (url) {
    return (
      <a
        href={url}
        target={target}
        style={style}
        rel={target === '_blank' ? 'noopener noreferrer' : undefined}
      >
        {content}
      </a>
    );
  }
  return (
    <button type="button" style={style}>
      {content}
    </button>
  );
}
