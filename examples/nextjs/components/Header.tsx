import type { CSSProperties, ReactNode } from 'react';

export type HeaderVariant = 'h1' | 'h2' | 'h3';

export interface HeaderProps {
  text?: string;
  variant?: HeaderVariant;
  children?: ReactNode;
}

const VARIANT_DEFAULTS: Record<HeaderVariant, CSSProperties> = {
  h1: { fontSize: '32px', fontWeight: 700, lineHeight: '1.2' },
  h2: { fontSize: '24px', fontWeight: 600, lineHeight: '1.3' },
  h3: { fontSize: '20px', fontWeight: 600, lineHeight: '1.35' },
};

export function Header({ text, variant = 'h2', children }: HeaderProps) {
  const Tag = variant;
  const style: CSSProperties = {
    ...VARIANT_DEFAULTS[variant],
    color: '#1f2937',
    margin: 0,
  };
  return (
    <Tag style={style}>
      {text}
      {children}
    </Tag>
  );
}
