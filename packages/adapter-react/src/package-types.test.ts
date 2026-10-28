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
} from '@contentful/experiences-react/client';
import { ContentfulExperiences } from '@contentful/experiences-react/web-sdk';
import type { RuntimeLivePreviewInitializer } from '@contentful/experiences-runtime';

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

it('exposes the structural lazy preview initializer through direct Web configuration', () => {
  expectTypeOf<
    ConstructorParameters<typeof ContentfulExperiences>[0]['livePreview']
  >().toEqualTypeOf<RuntimeLivePreviewInitializer | undefined>();
});
