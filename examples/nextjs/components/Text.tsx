import type { CSSProperties, ReactNode } from 'react';

export interface TextProps {
  value?: string;
  children?: ReactNode;
}

export function Text({ value, children }: TextProps) {
  const style: CSSProperties = {
    fontSize: 16,
    lineHeight: 1.5,
    color: '#4b5563',
    margin: 0,
  };
  return (
    <p style={style}>
      {value}
      {children}
    </p>
  );
}
