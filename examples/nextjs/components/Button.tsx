import type { CSSProperties, ReactNode } from 'react';

export type ButtonType = 'primary' | 'secondary';

export interface ButtonProps {
  text?: string;
  url?: string;
  type?: ButtonType;
  children?: ReactNode;
}

const PALETTE: Record<ButtonType, CSSProperties> = {
  primary: { background: '#4f39f6', color: '#ffffff' },
  secondary: { background: '#ffffff', color: '#1f2937', border: '1px solid #d1d5db' },
};

export function Button({ text, url, type = 'primary', children }: ButtonProps) {
  const palette = PALETTE[type];
  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '12px 18px',
    borderRadius: 8,
    background: palette.background,
    color: palette.color,
    fontWeight: 500,
    border: palette.border ?? 'none',
    textDecoration: 'none',
    cursor: 'pointer',
  };

  const content = (
    <>
      {text ?? 'Button'}
      {children}
    </>
  );
  if (url) {
    return (
      <a href={url} style={style} rel="noopener noreferrer">
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
