import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import type {
  ComponentTypeNode,
  ExperiencePayload,
} from '@contentful/experiences-core';
import { resolveExperience } from '@contentful/experiences-core';

import { ClientExperienceRenderer } from './client-renderer';
import { useOptimization } from './optimization/context';
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
  nodes: [
    componentNode('contentful-text', {
      id: 'node-1',
      contentProperties: { label: 'hello' },
    }),
  ],
};

describe('ClientExperienceRenderer — optimization prop', () => {
  it('renders unchanged when `optimization` prop is absent', async () => {
    const plan = await resolveExperience(payload, config);
    const html = renderToStaticMarkup(
      <ClientExperienceRenderer experience={plan} config={config} />,
    );

    expect(html).toBe('<span>hello</span>');
    expect(html).not.toContain('data-ctfl-node-id');
  });

  it('renders unchanged when `optimization.enabled` is false', async () => {
    const plan = await resolveExperience(payload, config);
    const html = renderToStaticMarkup(
      <ClientExperienceRenderer
        experience={plan}
        config={config}
        optimization={{ enabled: false, client: {} }}
      />,
    );

    expect(html).toBe('<span>hello</span>');
  });

  it('degrades to a no-op when the optional peer is not installed (workspace has no peer)', async () => {
    // In this workspace `@contentful/optimization-react-web` is not installed,
    // so `adapterFactory === null` and the runtime never mounts. Proves the
    // flag degrades gracefully instead of crashing when the peer is missing.
    let captured: unknown;
    const CaptureResolved = () => {
      captured = useOptimization().resolved;
      return null;
    };
    const captureConfig: Config = {
      components: { 'contentful-capture': CaptureResolved },
    };
    const capturePayload: ExperiencePayload = {
      viewports: VIEWPORTS,
      nodes: [componentNode('contentful-capture', { id: 'node-1' })],
    };
    const plan = await resolveExperience(capturePayload, captureConfig);

    const html = renderToStaticMarkup(
      <ClientExperienceRenderer
        experience={plan}
        config={captureConfig}
        optimization={{ enabled: true, client: {} }}
      />,
    );

    expect(captured).toBeNull();
    expect(html).not.toContain('data-ctfl-node-id');
  });

  it('does not throw on SSR when `optimization.enabled` is true', async () => {
    // SSR path never runs effects. Proves the SSR one-pass contract still
    // holds when the prop is enabled (regardless of peer presence).
    const plan = await resolveExperience(payload, config);
    expect(() =>
      renderToStaticMarkup(
        <ClientExperienceRenderer
          experience={plan}
          config={config}
          optimization={{ enabled: true, client: {} }}
        />,
      ),
    ).not.toThrow();
  });
});
