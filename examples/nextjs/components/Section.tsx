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
 * The layout primitive of this design system — a flex (or grid) container.
 * Every knob comes off `useDesignValues()`: these keys are author-defined
 * *semantic* styling (`direction`, `itemAlign`, `ratio`, …), not `cf`-
 * prefixed CSS, so the component reads them by name rather than through
 * `toCss`. Token-valued keys (`gap`, spacing, colors, `radius`) arrive
 * already resolved to CSS strings by the Config's `resolveToken`.
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

  // A colon-delimited ratio (e.g. "1:2:1") lays direct children out in a grid
  // with matching fractional tracks; "equal" / "auto" fall back to flex.
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
