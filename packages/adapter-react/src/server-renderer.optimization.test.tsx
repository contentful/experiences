import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import type {
  ComponentTypeNode,
  ExperiencePayload,
} from '@contentful/experiences-core';
import { resolveExperience } from '@contentful/experiences-core';

import { ServerExperienceRenderer } from './server-renderer';
import type { Config } from './types';

const VIEWPORTS = [{ id: 'desktop', query: '*', displayName: 'Desktop', previewSize: '100%' }];

function componentNode(
  typeId: string,
  rest: Omit<ComponentTypeNode, 'componentType'> = {},
): ComponentTypeNode {
  return {
    componentType: {
      sys: {
        type: 'ResourceLink',
        linkType: 'Contentful:ComponentType',
        urn: `crn:contentful:::experience:spaces/$self/environments/$self/componentTypes/${typeId}`,
      },
    },
    ...rest,
  };
}

const Text = ({ label }: { label?: string }) => <span>{label}</span>;
const config: Config = { components: { 'contentful-text': Text } };

const payload: ExperiencePayload = {
  viewports: VIEWPORTS,
  nodes: [componentNode('contentful-text', { id: 'node-1', contentProperties: { label: 'x' } })],
};

describe('ServerExperienceRenderer — optimization prop', () => {
  it('renders unchanged when `optimization` prop is absent', async () => {
    const plan = await resolveExperience(payload, config);
    const html = renderToStaticMarkup(
      <ServerExperienceRenderer experience={plan} config={config} />,
    );
    expect(html).toBe('<span>x</span>');
  });

  it('renders unchanged when `optimization.enabled` is false', async () => {
    const plan = await resolveExperience(payload, config);
    const html = renderToStaticMarkup(
      <ServerExperienceRenderer
        experience={plan}
        config={config}
        optimization={{ enabled: false, client: {} }}
      />,
    );
    expect(html).toBe('<span>x</span>');
  });

  it('degrades to a no-op when the peer is missing (workspace has no peer)', async () => {
    const plan = await resolveExperience(payload, config);
    const html = renderToStaticMarkup(
      <ServerExperienceRenderer
        experience={plan}
        config={config}
        optimization={{ enabled: true, client: {} }}
      />,
    );
    expect(html).toBe('<span>x</span>');
    expect(html).not.toContain('data-ctfl-node-id');
  });
});
