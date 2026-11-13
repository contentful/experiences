'use client';

import type { ReactNode } from 'react';
import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';
import {
  ClientExperienceRenderer,
  type ClientExperienceRendererProps,
} from '../rendering/client-renderer.js';
import {
  useExperienceSource,
  type ExperienceNotifications,
  type ManagedExperienceKey,
  type ManagedExperienceOptions,
  type ManagedExperienceResult,
} from './use-managed-experience.js';

type Fallback = ReactNode | ((result: ManagedExperienceResult) => ReactNode);

interface ExperiencePresentationProps
  extends Omit<ClientExperienceRendererProps, 'experience'>, ExperienceNotifications {
  readonly loadingFallback?: Fallback;
  readonly errorFallback?: Fallback;
  /**
   * Presented instead of content for a Destination redirect. Defaults to nothing:
   * the SDK never navigates, so handle `onExperienceRedirect` or route at the framework boundary.
   */
  readonly redirectFallback?: Fallback;
  readonly children?: (result: ManagedExperienceResult) => ReactNode;
}

export type SuppliedExperienceProps = ExperiencePresentationProps & {
  readonly experience: PortableRenderPlan | null | undefined;
} & { readonly [Key in ManagedExperienceKey]?: never };

export type ManagedExperienceProps =
  | SuppliedExperienceProps
  | (ExperiencePresentationProps & ManagedExperienceOptions & { readonly experience?: never });

/** Managed and seeded presentation share the supplied-plan renderer and tracking surface. */
export function Experience(props: ManagedExperienceProps): ReactNode {
  const result = useExperienceSource(props);
  const { children, loadingFallback, errorFallback, redirectFallback } = props;
  if (children) return children(result);
  const present = (fallback: Fallback | undefined) =>
    (typeof fallback === 'function' ? fallback(result) : fallback) ?? null;
  // A redirect is control flow, never content.
  if (result.redirect) return present(redirectFallback);
  // Usable content survives refresh and preview errors; callbacks can present both explicitly.
  if (result.data) return <ClientExperienceRenderer {...props} experience={result.data} />;
  return present(result.error ? errorFallback : loadingFallback);
}
