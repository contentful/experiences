'use client';

import type { CSSProperties, ReactNode } from 'react';

import { useDesignValues } from '@contentful/experiences-react';

export interface SectionProps {
  children?: ReactNode;
}

type Align = 'start' | 'center' | 'end' | 'stretch';

const ALIGN: Record<Align, CSSProperties['alignItems']> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
};

/**
 * Flex/grid layout primitive. Reads its semantic design keys (`direction`,
 * `ratio`, …) by name off `useDesignValues()`; token-valued keys arrive
 * already resolved to CSS by `resolveToken`.
 */
export function Section({ children }: SectionProps) {
  const design = useDesignValues();

  const direction = (design.direction as 'row' | 'column') ?? 'column';
  const reverse = design.reverse === true;
  const ratio = design.ratio as string | undefined;
  const itemAlign = (design.itemAlign as Align | undefined) ?? 'stretch';

  const flexDirection =
    `${direction}${reverse ? '-reverse' : ''}` as CSSProperties['flexDirection'];

  const style: CSSProperties = {
    display: 'flex',
    flexDirection,
    alignItems: ALIGN[itemAlign],
    gap: (design.gap as string) ?? undefined,
    paddingBlock: (design.verticalSpacing as string) ?? undefined,
    paddingInline: (design.horizontalSpacing as string) ?? undefined,
    backgroundColor: (design.backgroundColor as string) ?? undefined,
    color: (design.color as string) ?? undefined,
    borderRadius: (design.radius as string) ?? undefined,
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
