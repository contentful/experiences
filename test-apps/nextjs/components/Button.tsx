'use client';

import type { CSSProperties } from 'react';

import { useDesignValues } from '@contentful/experiences-react';

export interface ButtonProps {
  label?: string;
  url?: string | null;
}

export function Button({ label, url }: ButtonProps) {
  const design = useDesignValues();
  const target = (design.target as string | undefined) ?? '_self';

  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '12px 18px',
    borderRadius: 8,
    background: (design.backgroundColor as string) ?? '#4f39f6',
    color: (design.color as string) ?? '#ffffff',
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
