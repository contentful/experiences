import { resolveExperience } from '@contentful/experiences-sdk-core';
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import type { Config } from '../registry/types.js';
import PropsProbe from '../test/fixtures/PropsProbe.svelte';
import { componentNode } from '../test/fixtures/render-plan.js';
import ServerExperienceRenderer from './ServerExperienceRenderer.svelte';

describe('supplied rendering', () => {
  const config: Config = { components: {} };

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
