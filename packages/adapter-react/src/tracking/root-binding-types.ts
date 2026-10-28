import type { HTMLAttributes, Ref } from 'react';

import type {
  NodeAttribution,
  ScopeAttribution,
  TrackingAttributes,
} from '@contentful/experiences-sdk-core';

import type { NodeSnapshot } from '../nodes/resolve-node-props.js';

/** Optimization-compatible overrides applied to each rendered node's actual roots. */
export interface ExperienceTrackingOptions {
  readonly clickable?: boolean;
  readonly trackClicks?: boolean;
  readonly trackHovers?: boolean;
  readonly trackViews?: boolean;
}

/** Props to spread onto an actual HTML root, including the composed ref. */
export type ExperienceRootProps<Element extends HTMLElement = HTMLElement> =
  HTMLAttributes<Element> &
    TrackingAttributes & {
      [attribute: `data-${string}`]: string | number | boolean | undefined;
      ref?: Ref<Element>;
    };

/** Runtime-only binding; never store it in a node snapshot. Use a distinct key per DOM root. */
export interface ExperienceRootBinding {
  readonly attribution?: NodeAttribution;
  getRootProps<Element extends HTMLElement = HTMLElement>(
    rootKey?: string,
    props?: ExperienceRootProps<Element>
  ): ExperienceRootProps<Element>;
}

export interface ExperienceNodeRoot {
  element: HTMLElement;
  node: NodeSnapshot;
  attribution: NodeAttribution | undefined;
  /** Innermost rooted scope, ready for the Web SDK's element registration data. */
  data: ScopeAttribution | undefined;
}

export type OnExperienceNodeRoot = (root: ExperienceNodeRoot) => void | (() => void);
