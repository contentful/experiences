import { resolveExperience } from '@contentful/experiences-sdk-core';
import { ContentfulExperiences, type Config } from '@contentful/experiences-web';
import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HeadingFixture from '../test/fixtures/HeadingFixture.svelte';
import { componentNode } from '../test/fixtures/render-plan.js';
import { createExperiences } from './create-experiences.js';

describe('createExperiences', () => {
  const config: Config = {
    spaceId: 'space',
    environmentId: 'environment',
    delivery: { accessToken: 'test' },
    locale: 'en-US',
  };
  const instances: ContentfulExperiences[] = [];
  function sdk() {
    const instance = new ContentfulExperiences(config);
    instances.push(instance);
    return instance;
  }
  afterEach(() => {
    cleanup();
    for (const instance of instances.splice(0)) instance.destroy();
    window.localStorage.clear();
    window.history.replaceState({}, '', '/');
    vi.restoreAllMocks();
  });

  it('uses the bound registry for supplied plans and updates without acquiring content', async () => {
    const suppliedOwner = sdk();
    const fetch = vi.spyOn(suppliedOwner, 'fetchExperience');
    const preview = vi.spyOn(suppliedOwner, 'subscribeToPreview');
    const registry = { components: { heading: HeadingFixture } };
    const { ExperienceRenderer } = createExperiences({ config: registry });
    const plan = (text: string) =>
      resolveExperience(
        { nodes: [componentNode('heading', { contentProperties: { text } })] },
        registry
      );
    const view = render(ExperienceRenderer, { experience: await plan('First') });
    expect(view.getByRole('heading').textContent).toBe('First');
    await view.rerender({ experience: await plan('Updated') });
    expect(view.getByRole('heading').textContent).toBe('Updated');
    expect(fetch).not.toHaveBeenCalled();
    expect(preview).not.toHaveBeenCalled();
  });
  it('binds registries without constructing Web and exports functional components', () => {
    const bound = createExperiences({ config: { components: {} } });
    expect(bound.ExperiencesRoot).toBeTypeOf('function');
    expect(bound.ExperiencesProvider).toBeTypeOf('function');
    expect(bound.ExperienceRenderer).toBeTypeOf('function');
    expect(bound.Experience).toBeTypeOf('function');
    expect(bound.useManagedExperience).toBeTypeOf('function');
    const independent = sdk();
    expect(independent).toBeInstanceOf(ContentfulExperiences);
  });
});
