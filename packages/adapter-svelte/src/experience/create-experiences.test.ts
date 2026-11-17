import { resolveExperience } from '@contentful/experiences-sdk-core';
import { ContentfulExperiences, type Config } from '@contentful/experiences-web';
import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HeadingFixture from '../test/fixtures/HeadingFixture.svelte';
import PropsProbe from '../test/fixtures/PropsProbe.svelte';
import { componentNode, m } from '../test/fixtures/render-plan.js';
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

  it('renders supplied plans through the bound registry and updates supplied content', async () => {
    // A live caller-owned SDK also demonstrates supplied rendering needs no new owner.
    sdk();
    const registry = {
      components: { heading: { component: HeadingFixture }, probe: { component: PropsProbe } },
    };
    const { ExperienceRenderer } = createExperiences({ config: registry });
    const plan = async (text: string, color: string, debug: boolean) => ({
      ...(await resolveExperience(
        {
          nodes: [
            componentNode('heading', { contentProperties: { text } }),
            componentNode('probe', {
              id: 'stable-probe',
              contentProperties: { value: text },
              designProperties: { color: m(color) },
            }),
          ],
        },
        registry
      )),
      metadata: { source: text, shared: 'plan' },
      debug,
    });
    const view = render(ExperienceRenderer, {
      experience: await plan('first supplied heading', 'red', true),
      metadata: { shared: 'first override' },
      debug: false,
    });
    const probe = view.container.querySelector('[data-props]')!;
    const read = (attribute: string) => JSON.parse(probe.getAttribute(attribute)!);
    expect(view.getByRole('heading').textContent).toBe('first supplied heading');
    expect(read('data-experience')).toEqual({
      metadata: { source: 'first supplied heading', shared: 'first override' },
      debug: false,
    });
    expect(read('data-contentful')).toMatchObject({ content: { value: 'first supplied heading' } });
    expect(read('data-design')).toEqual({ color: 'red' });
    await view.rerender({
      experience: await plan('updated supplied heading', 'blue', false),
      metadata: { shared: 'updated override' },
      debug: true,
    });
    expect(view.getByRole('heading').textContent).toBe('updated supplied heading');
    expect(view.container.querySelector('[data-props]')).toBe(probe);
    expect(read('data-experience')).toEqual({
      metadata: { source: 'updated supplied heading', shared: 'updated override' },
      debug: true,
    });
    expect(read('data-contentful')).toMatchObject({
      content: { value: 'updated supplied heading' },
    });
    expect(read('data-design')).toEqual({ color: 'blue' });
    await view.rerender({
      experience: await plan('inherited supplied heading', 'green', false),
      metadata: undefined,
      debug: undefined,
    });
    expect(view.getByRole('heading').textContent).toBe('inherited supplied heading');
    expect(view.container.querySelector('[data-props]')).toBe(probe);
    expect(read('data-experience')).toEqual({
      metadata: { source: 'inherited supplied heading', shared: 'plan' },
      debug: false,
    });
    expect(read('data-contentful')).toMatchObject({
      content: { value: 'inherited supplied heading' },
    });
    expect(read('data-design')).toEqual({ color: 'green' });
  });
  it('binds registries without constructing Web and exports functional components', () => {
    const bound = createExperiences({ config: { components: {} } });
    expect(bound.ExperiencesRoot).toBeTypeOf('function');
    expect(bound.ExperiencesProvider).toBeTypeOf('function');
    expect(bound.ExperienceRenderer).toBeTypeOf('function');
    const independent = sdk();
    expect(independent).toBeInstanceOf(ContentfulExperiences);
  });
});
