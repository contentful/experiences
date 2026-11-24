import type { ExperienceNode, ExperiencePayload } from '@contentful/experiences-sdk-core';
import type { InspectorCapture } from '../inspector-poc/source-map.js';

// Portable authored graph. No real capture, service access, or content values.
export const repeatedCapture: InspectorCapture = {
  spaceId: 'fixture-space',
  environmentId: 'fixture-environment',
  rootComponentId: 'repeated-sections',
  trees: {
    'repeated-sections': [
      {
        id: 'first',
        component: 'cta',
        slots: {
          body: [
            {
              id: 'body-layout',
              component: 'flex',
              slots: {
                children: [
                  { id: 'body-copy', component: 'paragraph' },
                  { id: 'body-link', component: 'link' },
                ],
              },
            },
          ],
        },
      },
      {
        id: 'second',
        component: 'cta',
        slots: {
          body: [
            {
              id: 'body-card',
              component: 'card',
              slots: {
                actions: [
                  { id: 'primary', component: 'link' },
                  { id: 'secondary', component: 'link' },
                ],
              },
            },
          ],
        },
      },
      { id: 'third', component: 'cta', slots: { body: [] } },
    ],
    cta: [
      {
        id: 'section',
        component: 'section',
        slots: {
          children: [
            { id: 'heading', component: 'heading' },
            { id: 'body-placeholder', slot: 'body' },
          ],
        },
      },
    ],
    card: [
      {
        id: 'card-layout',
        component: 'flex',
        slots: {
          children: [
            { id: 'card-heading', component: 'heading' },
            { id: 'actions-placeholder', slot: 'actions' },
          ],
        },
      },
    ],
  },
};

function node(
  id: string,
  type: string,
  slots: Record<string, ExperienceNode[]> = {}
): ExperienceNode {
  return {
    id,
    component: {
      sys: {
        type: 'ResourceLink',
        linkType: 'Contentful:Component',
        urn: `crn:contentful:::experience:spaces/$self/environments/$self/components/${type}`,
      },
    },
    contentProperties: { title: `Live ${id}` },
    slots,
  };
}

// Written independently of the graph expander, matching its delivered shape.
export function repeatedPayload(): ExperiencePayload {
  return {
    sys: { type: 'Experience', id: 'preview' },
    nodes: [
      node('first-section', 'section', {
        children: [
          node('first-heading', 'heading'),
          node('first-body', 'flex', {
            children: [node('first-copy', 'paragraph'), node('first-link', 'link')],
          }),
        ],
      }),
      node('second-section', 'section', {
        children: [
          node('second-heading', 'heading'),
          node('second-card', 'flex', {
            children: [
              node('second-card-heading', 'heading'),
              node('second-primary', 'link'),
              node('second-secondary', 'link'),
            ],
          }),
        ],
      }),
      node('third-section', 'section', { children: [node('third-heading', 'heading')] }),
    ],
  };
}
