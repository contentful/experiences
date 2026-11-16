import { createElement, type ElementType, type ReactNode } from 'react';
import { getTrackingAttributes, type PortableRenderPlan } from '@contentful/experiences-sdk-core';

import type {
  ExperienceRootProps,
  ExperienceTrackingOptions,
} from '../tracking/root-binding-types.js';

export interface ExperienceBoundaryOptions extends ExperienceTrackingOptions {
  /** Experience container. Defaults to a div with display: contents, following Optimization. */
  as?: ElementType;
  /** Additional container attributes; the SDK owns its attribution and children. */
  rootProps?: ExperienceRootProps;
}

export function ExperienceBoundary({
  experience,
  children,
  as = 'div',
  rootProps,
}: ExperienceBoundaryOptions & { experience: PortableRenderPlan; children: ReactNode }): ReactNode {
  // An empty boundary prevents a nested unattributed plan borrowing its ancestor's scopes.
  const props = {
    ...rootProps,
    ...getTrackingAttributes(experience.attribution ?? { scopes: {} }),
    children,
  };
  return createElement(as, {
    ...props,
    style: { display: 'contents', ...rootProps?.style },
  });
}
