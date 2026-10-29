import type { HTMLAttributes } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ContentfulExperiences } from '@contentful/experiences-web';
import { resolveExperience } from '@contentful/experiences-sdk-core';
import { createReactExperiences } from './create-react-experiences.js';

vi.mock('@contentful/experiences-web', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@contentful/experiences-web')>()),
  ContentfulExperiences: vi.fn(() => {
    throw new Error('Registry binding must not construct a Web SDK');
  }),
}));

describe('createReactExperiences', () => {
  it('purely binds the registry and forwards renderer props without a runtime provider', async () => {
    function Component(props: HTMLAttributes<HTMLElement>) {
      return <article {...props}>Bound registry</article>;
    }
    const config = { components: { probe: Component } };
    const ui = createReactExperiences({ config });
    expect(ContentfulExperiences).not.toHaveBeenCalled();
    const plan = await resolveExperience(
      {
        nodes: [
          {
            id: 'n',
            component: {
              sys: {
                type: 'ResourceLink',
                linkType: 'Contentful:Component',
                urn: 'crn:contentful:::experience:spaces/$self/environments/$self/components/probe',
              },
            },
          },
        ],
      },
      config
    );
    const html = renderToString(
      <ui.ExperienceRenderer
        experience={plan}
        as="section"
        rootProps={{ id: 'bound-root', className: 'bound-container' }}
      />
    );
    const root = html.match(/^<section\b[^>]*>/)?.[0];
    expect(root).toContain('id="bound-root"');
    expect(root).toContain('class="bound-container"');
    expect(html).toContain('Bound registry');
    expect(html).toMatch(/<\/section>$/);
    expect(ContentfulExperiences).not.toHaveBeenCalled();
  });
});
