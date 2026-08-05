'use client';

import type { CSSProperties, ReactNode } from 'react';

type Align = 'start' | 'center' | 'end' | 'stretch';

const ALIGN: Record<Align, CSSProperties['alignItems']> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
};

/**
 * Flex/grid layout primitive. Design keys arrive as ordinary props — the SDK
 * pre-resolves them server-side (cascade to viewport + token resolution) and
 * auto-fills them alongside content, so this reads them directly off props
 * instead of calling `useDesignValues()`. Token-valued keys arrive already
 * resolved to CSS.
 */
export interface SectionProps {
  children?: ReactNode;
  // Design props (auto-filled, already resolved):
  direction?: 'row' | 'column';
  reverse?: boolean;
  ratio?: string;
  itemAlign?: Align;
  gap?: string;
  verticalSpacing?: string;
  horizontalSpacing?: string;
  backgroundColor?: string;
  color?: string;
  radius?: string;
}

export function Section(props: SectionProps) {
  console.log('[Section] resolved props →', props);

  const {
    children,
    direction = 'column',
    reverse = false,
    ratio,
    itemAlign = 'stretch',
    gap,
    verticalSpacing,
    horizontalSpacing,
    backgroundColor,
    color,
    radius,
  } = props;

  const flexDirection =
    `${direction}${reverse ? '-reverse' : ''}` as CSSProperties['flexDirection'];

  const style: CSSProperties = {
    display: 'flex',
    flexDirection,
    alignItems: ALIGN[itemAlign],
    gap: gap ?? undefined,
    paddingBlock: verticalSpacing ?? undefined,
    paddingInline: horizontalSpacing ?? undefined,
    backgroundColor: backgroundColor ?? undefined,
    color: color ?? undefined,
    borderRadius: radius ?? undefined,
  };

  // A colon ratio ("1:2:1") lays children out in grid tracks; else flex.
  if (ratio && ratio.includes(':')) {
    const tracks = ratio
      .split(':')
      .map((n) => `${Number(n) || 1}fr`)
      .join(' ');
    style.display = 'grid';
    style.gridTemplateColumns = direction === 'column' ? undefined : tracks;
    style.gridTemplateRows = direction === 'column' ? tracks : undefined;
    delete style.flexDirection;
    delete style.alignItems;
  }

  return <div style={style}>{children}</div>;
}
