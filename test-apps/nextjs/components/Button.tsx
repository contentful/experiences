'use client';

import type { CSSProperties } from 'react';

/**
 * Design values (`target`, `backgroundColor`, `color`) arrive as ordinary
 * props, auto-filled by the SDK after server-side resolution — no
 * `useDesignValues()` call. `label`/`url` come from content + `resolveData`.
 */
export interface ButtonProps {
  label?: string;
  url?: string | null;
  // Design props (auto-filled, already resolved):
  target?: string;
  backgroundColor?: string;
  color?: string;
}

export function Button(props: ButtonProps) {
  console.log('[Button] resolved props →', props);

  const { label, url, target = '_self', backgroundColor, color } = props;

  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '12px 18px',
    borderRadius: 8,
    background: backgroundColor ?? '#4f39f6',
    color: color ?? '#ffffff',
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
