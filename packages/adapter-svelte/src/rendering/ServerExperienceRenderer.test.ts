import type { ExperiencePayload } from '@contentful/experiences-sdk-core';
import { resolveExperience } from '@contentful/experiences-sdk-core';
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import type { Config } from '../registry/types.js';
import ButtonFixture from '../test/fixtures/ButtonFixture.svelte';
import PropsProbe from '../test/fixtures/PropsProbe.svelte';
import ContainerFixture from '../test/fixtures/ContainerFixture.svelte';
import HeadingFixture from '../test/fixtures/HeadingFixture.svelte';
import { componentNode, m } from '../test/fixtures/render-plan.js';
import ServerExperienceRenderer from './ServerExperienceRenderer.svelte';

describe('supplied rendering', () => {
  const config: Config = {
    components: {
      'contentful-container': ContainerFixture,
      'contentful-heading': HeadingFixture,
      'contentful-button': ButtonFixture,
    },
  };

  const payload: ExperiencePayload = {
    nodes: [
      componentNode('contentful-container', {
        id: 'page',
        contentProperties: {},
        designProperties: {
          cfPadding: m('40px'),
        },
        slots: {
          children: [
            componentNode('contentful-heading', {
              id: 'heading',
              contentProperties: { text: 'Build faster' },
              designProperties: {
                cfFontSize: m('32px'),
              },
            }),
            componentNode('contentful-button', {
              id: 'btn',
              contentProperties: { label: 'Get started' },
              designProperties: {
                cfBackgroundColor: m('#4f39f6'),
              },
            }),
          ],
        },
      }),
    ],
  };
  it('renders a nested experience with design props', async () => {
    const plan = await resolveExperience(payload, config);
    const { container } = render(ServerExperienceRenderer, {
      props: { experience: plan, config },
    });
    const html = container.innerHTML;

    expect(html).toContain('data-padding="40px"');
    expect(html).toContain('data-font-size="32px"');
    expect(html).toContain('data-bg="#4f39f6"');
    expect(html).toContain('Build faster');
    expect(html).toContain('Get started');
  });

  it('renders nothing meaningful when plan is null/undefined', () => {
    const { container: nullContainer } = render(ServerExperienceRenderer, {
      props: { experience: null, config },
    });
    expect(nullContainer.querySelector('*')).toBeNull();

    const { container: undefContainer } = render(ServerExperienceRenderer, {
      props: { experience: undefined, config },
    });
    expect(undefContainer.querySelector('*')).toBeNull();
  });

  it.each([
    {
      metadata: undefined,
      debug: undefined,
      expectedMetadata: { slug: 'home', locale: 'en-US' },
      expectedDebug: true,
    },
    {
      metadata: { locale: 'de-DE', extra: true },
      debug: false,
      expectedMetadata: { slug: 'home', locale: 'de-DE', extra: true },
      expectedDebug: false,
    },
  ])(
    'inherits plan context and applies explicit metadata/debug overrides ($expectedDebug)',
    async ({ metadata, debug, expectedMetadata, expectedDebug }) => {
      const config: Config = { components: { probe: PropsProbe } };
      const plan = await resolveExperience({ nodes: [componentNode('probe')] }, config, {
        metadata: { slug: 'home', locale: 'en-US' },
        debug: true,
      });
      const { container } = render(ServerExperienceRenderer, {
        props: { experience: plan, config, metadata, debug },
      });
      const context = JSON.parse(
        container.querySelector('[data-experience]')!.getAttribute('data-experience')!
      );
      expect(context.metadata).toEqual(expectedMetadata);
      expect(context.debug).toBe(expectedDebug);
      expect(!!container.querySelector('[data-experiences-debug]')).toBe(expectedDebug);
      if (expectedDebug) expect(container.textContent).toContain('Experience debug');
    }
  );
});
