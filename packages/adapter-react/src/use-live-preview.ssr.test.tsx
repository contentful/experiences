import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';
import { useLivePreview, useLivePreviewInspection } from './index';

describe('useLivePreview server rendering', () => {
  it('renders the initial plan with inspection enabled before browser observation starts', () => {
    const initialPlan: PortableRenderPlan = {
      nodes: [],
      metadata: { title: 'initial plan' },
      debug: false,
      diagnostics: [],
    };
    function Preview() {
      const { data } = useLivePreview({
        initialPlan,
        inspection: true,
        resolveOptions: { config: { components: {} } },
      });
      useLivePreviewInspection({ sourceMap: data?.sourceMap, enabled: true });
      return <output>{String(data?.metadata.title ?? 'missing')}</output>;
    }

    expect(renderToString(<Preview />)).toBe('<output>initial plan</output>');
  });
});
