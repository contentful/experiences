import { resolveExperience } from '@contentful/experiences-sdk-core';
import { render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { Config } from '../registry/types.js';
import ButtonFixture from '../test/fixtures/ButtonFixture.svelte';
import ExperienceTemplateFixture from '../test/fixtures/ExperienceTemplateFixture.svelte';
import HeadingFixture from '../test/fixtures/HeadingFixture.svelte';
import PropsProbe from '../test/fixtures/PropsProbe.svelte';
import ContainerFixture from '../test/fixtures/ContainerFixture.svelte';
import { componentNode, sysWithExperienceTemplate } from '../test/fixtures/render-plan.js';
import ClientExperienceRenderer from './ClientExperienceRenderer.svelte';
import ServerExperienceRenderer from './ServerExperienceRenderer.svelte';

describe('supplied rendering', () => {
  it('renders a composite experience unwrapped — sys.experienceTemplate is ignored', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // `hero` is registered as a template, but the nodes are plain components,
    // so nothing may wrap them.
    const cfg: Config = {
      components: { item: PropsProbe },
      experienceTemplates: { hero: ExperienceTemplateFixture },
    };
    const plan = await resolveExperience(
      {
        sys: sysWithExperienceTemplate('hero'),
        nodes: [
          componentNode('item', { id: 'a', contentProperties: { value: 'one' } }),
          componentNode('item', { id: 'b', contentProperties: { value: 'two' } }),
        ],
      },
      cfg
    );
    const { container } = render(ServerExperienceRenderer, {
      props: { experience: plan, config: cfg },
    });
    expect(container.innerHTML).toContain('data-value="one"');
    expect(container.innerHTML).toContain('data-value="two"');
    expect(container.innerHTML).not.toContain('data-experience-template');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('NodesRenderer — slot children as an array', () => {
  it('passes slot children as a Snippet[] a component can wrap individually', async () => {
    const cfg: Config = {
      components: {
        'contentful-container': ContainerFixture,
        'contentful-heading': HeadingFixture,
      },
    };
    const plan = await resolveExperience(
      {
        nodes: [
          componentNode('contentful-container', {
            slots: {
              children: ['one', 'two'].map((text) =>
                componentNode('contentful-heading', {
                  contentProperties: { text },
                })
              ),
            },
          }),
        ],
      },
      cfg
    );
    const { container } = render(ServerExperienceRenderer, {
      props: { experience: plan, config: cfg },
    });

    // The component received a real array of the right length.
    expect(container.querySelector('[data-container]')?.getAttribute('data-array')).toBe('true');
    expect(container.querySelector('[data-container]')?.getAttribute('data-count')).toBe('2');

    // Each child got its own wrapper — proves per-child rendering control.
    const wrappers = container.querySelectorAll('.wrap');
    expect(Array.from(wrappers).map((wrapper) => wrapper.textContent)).toEqual(['one', 'two']);
  });

  it('renders an empty container when the slot has no children', async () => {
    const cfg: Config = {
      components: { 'contentful-container': ContainerFixture },
    };
    const plan = await resolveExperience(
      { nodes: [componentNode('contentful-container', { id: 'c' })] },
      cfg
    );
    const { container } = render(ServerExperienceRenderer, {
      props: { experience: plan, config: cfg },
    });
    expect(container.querySelector('[data-container]')?.getAttribute('data-count')).toBe('0');
    expect(container.querySelectorAll('.wrap').length).toBe(0);
    expect(container.querySelector('[data-container]')).not.toBeNull();
  });
});

describe('registration updates', () => {
  describe('ClientExperienceRenderer — registration changes on a reused node id', () => {
    it('renders the new component when a plan update swaps the component behind a node id', async () => {
      const config: Config = {
        components: { 'contentful-button': ButtonFixture, 'contentful-heading': HeadingFixture },
      };
      const first = await resolveExperience(
        {
          nodes: [
            componentNode('contentful-button', { id: 'n', contentProperties: { label: 'a' } }),
          ],
        },
        config
      );
      const second = await resolveExperience(
        {
          nodes: [
            componentNode('contentful-heading', { id: 'n', contentProperties: { text: 'b' } }),
          ],
        },
        config
      );

      const { container, rerender } = render(ClientExperienceRenderer, {
        props: { experience: first, config },
      });
      expect(container.querySelector('button')?.textContent).toBe('a');

      await rerender({ experience: second, config });

      expect(container.querySelector('button')).toBeNull();
      expect(container.textContent).toContain('b');
    });
  });
});
