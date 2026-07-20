import type { CSSProperties, ReactNode } from 'react';

export interface PageProps {
  title?: string;
  children?: ReactNode;
}

/**
 * Page-level template: passthrough wrapper. Each top-level node handles its
 * own containment — the hero goes edge-to-edge, the cards Section applies
 * its own horizontal padding via design values. Keeping the template thin
 * matches the Svelte example and lets full-width heroes render without a
 * fight against a max-width parent.
 */
export function Page({ children }: PageProps) {
  const wrapper: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  };
  return <main style={wrapper}>{children}</main>;
}
