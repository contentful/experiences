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
  type ManagedExperienceOptions,
  type ManagedExperienceResult,
} from './use-managed-experience.js';

interface ExperiencePresentationProps
  extends Omit<ClientExperienceRendererProps, 'experience'>, ExperienceNotifications {
  readonly loadingFallback?: ReactNode | ((result: ManagedExperienceResult) => ReactNode);
  readonly errorFallback?: ReactNode | ((result: ManagedExperienceResult) => ReactNode);
  readonly children?: (result: ManagedExperienceResult) => ReactNode;
}

export type SuppliedExperienceProps = ExperiencePresentationProps & {
  readonly experience: PortableRenderPlan | null | undefined;
} & {
  readonly [
    Key in keyof Omit<ManagedExperienceOptions, 'config' | keyof ExperienceNotifications>
  ]?: never;
};

export type ManagedExperienceProps =
  | SuppliedExperienceProps
  | (ExperiencePresentationProps & ManagedExperienceOptions & { readonly experience?: never });

/** Managed and seeded presentation share the supplied-plan renderer and tracking surface. */
export function Experience(props: ManagedExperienceProps): ReactNode {
  const result = useExperienceSource(props);
  const { children, loadingFallback, errorFallback } = props;
  if (children) return children(result);
  // Usable content survives refresh and preview errors; callbacks can present both explicitly.
  if (result.data) return <ClientExperienceRenderer {...props} experience={result.data} />;
  const fallback = result.error ? errorFallback : loadingFallback;
  return (typeof fallback === 'function' ? fallback(result) : fallback) ?? null;
}
