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

it('preserves exclusive destination selectors in bound options and supplied props', () => {
  type Options = import('./experience/create-experiences.js').BoundManagedExperienceOptions;
  const path: Options = { destinationId: 'site', path: '/landing', locale: 'de-DE' };
  const node: Options = { destinationId: 'site', nodeId: 'catalog-node' };
  const id: Options = { experienceId: 'home', parameters: { category: 'news' } };
  // @ts-expect-error Source selectors are exclusive.
  const mixed: Options = { experienceId: 'home', destinationId: 'site', path: '/' };
  // @ts-expect-error Destination lookup requires path or nodeId.
  const missing: Options = { destinationId: 'site' };
  // @ts-expect-error Parameters belong to by-ID delivery.
  const parameters: Options = { destinationId: 'site', path: '/', parameters: {} };
  // @ts-expect-error Supplied content excludes destination selectors.
  const supplied: BoundManagedExperienceProps = {
    experience: null,
    destinationId: 'site',
    path: '/',
  };
  void [path, node, id, mixed, missing, parameters, supplied];
});
