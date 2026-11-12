'use client';

import { forwardRef, type ComponentPropsWithoutRef } from 'react';

export type ManualViewTrackingProps = ComponentPropsWithoutRef<'div'>;

/** Registers each attributed DOM root below this boundary as an independent view. */
export const ManualViewTracking = forwardRef<HTMLDivElement, ManualViewTrackingProps>(
  function ManualViewTracking(props, ref) {
    return <div {...props} ref={ref} data-ctfl-manual-views="true" />;
  }
);
