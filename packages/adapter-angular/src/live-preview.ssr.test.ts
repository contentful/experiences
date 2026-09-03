import { Component, provideZonelessChangeDetection } from '@angular/core';
import { type BootstrapContext, bootstrapApplication } from '@angular/platform-browser';
import { provideServerRendering, renderApplication } from '@angular/platform-server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExperiencePayload, PortableRenderPlan } from '@contentful/experiences-sdk-core';

import { injectLivePreview, type InjectLivePreviewOptions } from './inject-live-preview.js';
import {
  injectResolvedExperience,
  type InjectResolvedExperienceOptions,
} from './inject-resolved-experience.js';

const payload: ExperiencePayload = {
  nodes: [
    {
      component: {
        sys: {
          linkType: 'Contentful:Component',
          type: 'ResourceLink',
          urn: 'crn:contentful:::experience:components/hero',
        },
      },
      contentProperties: { title: 'server data' },
    },
  ],
  sys: { type: 'Experience' },
  viewports: [{ displayName: 'Default', id: 'default', previewSize: '1024px', query: '*' }],
};

const initialExperience: PortableRenderPlan = {
  fallbackViewportIndex: 0,
  nodes: [
    {
      nodeId: 'initial',
      registration: { kind: 'component', id: 'hero' },
      props: { content: { title: 'server initial' }, design: {}, designRaw: {} },
      slots: {},
    },
  ],
  viewports: payload.viewports,
  metadata: {},
  debug: false,
  diagnostics: [],
};

const DOCUMENT =
  '<!doctype html><html><head></head><body><cf-raw-root></cf-raw-root><cf-resolved-root></cf-resolved-root></body></html>';

@Component({
  selector: 'cf-raw-root',
  template: `<output>{{
    livePreview.data()?.nodes?.[0]?.contentProperties?.['title'] ?? ''
  }}</output>`,
})
class RawRoot {
  readonly options: InjectLivePreviewOptions = {
    environmentId: 'environment-id',
    initialData: payload,
    previewToken: 'preview-token',
    sessionHost: 'wss://preview-session.example.test',
    sessionId: 'session-id',
    spaceId: 'space-id',
  };
  readonly livePreview = injectLivePreview(() => this.options);
}

@Component({
  selector: 'cf-resolved-root',
  template: `<output>{{ resolved.data()?.nodes?.[0]?.props?.content?.['title'] ?? '' }}</output>`,
})
class ResolvedRoot {
  readonly options: InjectResolvedExperienceOptions = {
    data: undefined,
    initialExperience,
    resolveOptions: { config: { components: {} } },
  };
  readonly resolved = injectResolvedExperience(() => this.options);
}

async function render<T>(component: new (...args: never[]) => T): Promise<string> {
  const bootstrap = (context: BootstrapContext) =>
    bootstrapApplication(
      component,
      {
        providers: [provideServerRendering(), provideZonelessChangeDetection()],
      },
      context
    );

  return renderApplication(bootstrap, { document: DOCUMENT });
}

beforeEach(() => {
  class UnexpectedWebSocket {
    constructor() {
      throw new Error('WebSocket must not be constructed during SSR.');
    }
  }
  vi.stubGlobal('WebSocket', UnexpectedWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('live-preview Angular helpers during SSR', () => {
  it('renders initial raw data without constructing a WebSocket', async () => {
    const html = await render(RawRoot);

    expect(html).toContain('server data');
  });

  it('renders the initial resolved experience without running the resolver', async () => {
    const html = await render(ResolvedRoot);

    expect(html).toContain('server initial');
  });
});
