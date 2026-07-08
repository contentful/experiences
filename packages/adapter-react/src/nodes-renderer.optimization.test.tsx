import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type {
  ComponentTypeNode,
  DeliveryViewSourceMap,
  ExperiencePayload,
} from '@contentful/experiences-core';
import { resolveExperience } from '@contentful/experiences-core';
import type {
  ExperiencesOptimizationAdapter,
  ResolvedNodeMetadata,
} from '@contentful/optimization-react-web/experiences-adapter';

import { OptimizationProvider } from './optimization/context';
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

const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
const Text = ({ label }: { label?: string }) => <span>{label}</span>;

const config: Config = {
  components: { 'contentful-box': Box, 'contentful-text': Text },
};

const payload: ExperiencePayload = {
  viewports: VIEWPORTS,
  nodes: [
    componentNode('contentful-box', {
      id: 'root',
      contentProperties: {},
      designProperties: {},
      slots: {
        children: [
          componentNode('contentful-text', {
            id: 'personalized-node',
            contentProperties: { label: 'A' },
          }),
          componentNode('contentful-text', {
            id: 'plain-node',
            contentProperties: { label: 'B' },
          }),
        ],
      },
    }),
  ],
};

const RESOLVED_A: ResolvedNodeMetadata = {
  entityId: 'entity-A',
  entityKind: 'Experience',
  optimizationId: 'opt-A',
  variantId: 'variant-A',
  variantIndex: 0,
};

const EMPTY_SOURCE_MAP: DeliveryViewSourceMap = {
  version: 1,
  variants: [],
  spaces: [],
  environments: [],
  locales: [],
  entries: [],
  assets: [],
  layers: [],
  dataAssemblies: [],
  nodes: {},
};

function makeAdapter(
  resolveMap: Record<string, ResolvedNodeMetadata | null>,
): ExperiencesOptimizationAdapter {
  return {
    useNodeBinding: (nodeId) => ({
      ref: () => {},
      resolved: resolveMap[nodeId] ?? null,
    }),
    attachInteractionRuntime: () => () => {},
  };
}

describe('NodeRenderer — optimization wire-in', () => {
  it('wraps only the personalized node when an OptimizationProvider is present', async () => {
    const adapter = makeAdapter({ 'personalized-node': RESOLVED_A, 'plain-node': null });
    const plan = await resolveExperience(payload, config, { sourceMap: EMPTY_SOURCE_MAP });
    const html = renderToStaticMarkup(
      <OptimizationProvider value={{ adapter, sourceMap: plan.sourceMap }}>
        <ServerExperienceRenderer experience={plan} config={config} />
      </OptimizationProvider>,
    );

    expect(html).toContain('data-ctfl-node-id="personalized-node"');
    expect(html).not.toContain('data-ctfl-node-id="plain-node"');
    // Both node contents still present — non-personalized node is untouched, not skipped.
    expect(html).toContain('<span>A</span>');
    expect(html).toContain('<span>B</span>');
  });

  it('leaves the tree unchanged when no OptimizationProvider is mounted', async () => {
    const plan = await resolveExperience(payload, config, { sourceMap: EMPTY_SOURCE_MAP });
    const html = renderToStaticMarkup(
      <ServerExperienceRenderer experience={plan} config={config} />,
    );

    expect(html).not.toContain('data-ctfl-node-id');
    expect(html).not.toContain('display:contents');
    expect(html).toContain('<span>A</span>');
    expect(html).toContain('<span>B</span>');
  });

  it('leaves the tree unchanged when the plan carries no sourceMap even if a provider is mounted', async () => {
    const adapter = makeAdapter({ 'personalized-node': RESOLVED_A });
    const plan = await resolveExperience(payload, config);
    const html = renderToStaticMarkup(
      <OptimizationProvider value={{ adapter, sourceMap: plan.sourceMap }}>
        <ServerExperienceRenderer experience={plan} config={config} />
      </OptimizationProvider>,
    );

    expect(html).not.toContain('data-ctfl-node-id');
  });
});
