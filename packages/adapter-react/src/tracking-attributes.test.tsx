import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { resolveExperience } from '@contentful/experiences-sdk-core';

import { useContentfulComponent } from './context';
import { getTrackingAttributes, ServerExperienceRenderer } from './index';
import type { Config } from './types';

const sourceMap = {
  version: 1,
  variants: [{ type: 'personalization', id: 'default' }],
  spaces: [],
  environments: [],
  locales: [],
  entries: [],
  assets: [],
  layers: [
    { kind: 'Experience', id: 'exp-a', variants: [0] },
    { kind: 'Component', id: 'box' },
  ],
  dataAssemblies: [],
  nodes: { n: { layers: [1, 0], scope: 0, contentProperties: [] } },
};

describe('getTrackingAttributes with a rendered component', () => {
  it('stamps the scope keys a node roots on its outermost element', async () => {
    const Box = () => <section {...getTrackingAttributes(useContentfulComponent()?.attribution)} />;
    const config: Config = { components: { box: Box } };
    const plan = await resolveExperience(
      {
        nodes: [
          {
            id: 'n',
            component: {
              sys: {
                type: 'ResourceLink',
                linkType: 'Contentful:Component',
                urn: 'crn:contentful:::experience:spaces/$self/environments/$self/components/box',
              },
            },
          },
        ],
      },
      config,
      { sourceMap }
    );

    const html = renderToStaticMarkup(
      <ServerExperienceRenderer experience={plan} config={config} />
    );

    const key = Object.keys(plan.attribution!.scopes)[0]!;
    expect(html).toContain(`data-ctfl-scopes="${key}"`);
  });
});
