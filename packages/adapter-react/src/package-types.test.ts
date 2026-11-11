import { expectTypeOf, it } from 'vitest';

import {
  ServerExperienceRenderer,
  type PortableRenderPlan,
} from '@contentful/experiences-react/server';
import {
  ClientExperienceRenderer,
  ExperienceRenderer,
  useExperiencePlan,
  type ExperienceRendererProps,
  type UseExperiencePlanResult,
  type ManagedExperienceProps,
  type BoundManagedExperienceProps,
  type ManagedExperienceResult,
  type ExperienceNotifications,
} from '@contentful/experiences-react/client';
import { ContentfulExperiences } from '@contentful/experiences-react/web-sdk';
import type { PreviewConfig } from '@contentful/experiences-runtime';

it('retains supplied-plan renderer and helper types on their explicit entries', () => {
  expectTypeOf<ExperienceRendererProps['experience']>().toEqualTypeOf<
    PortableRenderPlan | null | undefined
  >();
  expectTypeOf<Parameters<typeof ServerExperienceRenderer>[0]['experience']>().toEqualTypeOf<
    ExperienceRendererProps['experience']
  >();
  expectTypeOf(ExperienceRenderer).toEqualTypeOf(ClientExperienceRenderer);
  expectTypeOf<ReturnType<typeof useExperiencePlan>>().toEqualTypeOf<UseExperiencePlanResult>();
});

it('retains the managed result in callbacks and both source modes in bound props', () => {
  expectTypeOf<
    Parameters<NonNullable<ExperienceNotifications['onExperienceResolved']>>[0]['data']
  >().toEqualTypeOf<PortableRenderPlan>();
  expectTypeOf<
    Parameters<NonNullable<ExperienceNotifications['onExperienceError']>>
  >().toEqualTypeOf<[Error, ManagedExperienceResult]>();
  expectTypeOf<
    Extract<ManagedExperienceProps, { experienceId: string }>['initialPlan']
  >().toEqualTypeOf<PortableRenderPlan | undefined>();
  expectTypeOf<
    Extract<ManagedExperienceProps, { experienceId: string }>['initialError']
  >().toEqualTypeOf<Error | undefined>();
  expectTypeOf<
    Extract<BoundManagedExperienceProps, { experience: unknown }>['initialError']
  >().toEqualTypeOf<undefined>();
  expectTypeOf<
    Extract<BoundManagedExperienceProps, { experienceId: string }>['experience']
  >().toEqualTypeOf<undefined>();
  expectTypeOf<
    Extract<BoundManagedExperienceProps, { experience: unknown }>['experienceId']
  >().toEqualTypeOf<undefined>();
});

it('exposes the structural preview configuration through direct Web configuration', () => {
  expectTypeOf<ConstructorParameters<typeof ContentfulExperiences>[0]['preview']>().toEqualTypeOf<
    PreviewConfig | undefined
  >();
});
