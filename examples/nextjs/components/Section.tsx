'use client';

import type { CSSProperties, ReactNode } from 'react';

type Align = 'start' | 'center' | 'end' | 'stretch';

const ALIGN: Record<Align, CSSProperties['alignItems']> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
};

export interface SectionProps {
  // Slot children arrive as an array of pre-rendered nodes — drop it straight
  // into JSX to render them all (React renders arrays), or map/filter/wrap the
  // children individually.
  children?: ReactNode[];
  // Design props (auto-filled, already server-resolved):
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

/**
 * Flex/grid layout primitive. Its semantic design keys (`direction`, `ratio`, …)
 * arrive as auto-filled props, already cascaded to the viewport and
 * token-resolved to CSS by `resolveToken`.
 *
 * Declare the design keys you consume by name and destructure them, as below.
 * Don't collect leftovers with `...rest` and forward them to a DOM element —
 * design keys (`backgroundColor`, `gap`, …) are camelCase prop names, not valid
 * HTML attributes, so React warns and they end up in the markup as junk. That's
 * true of unrecognized content props too; naming what you use avoids both.
 */
export function Section(props: SectionProps) {
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
    gap,
    paddingBlock: verticalSpacing,
    paddingInline: horizontalSpacing,
    backgroundColor,
    color,
    borderRadius: radius,
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
