import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';
import { useLivePreview } from './use-live-preview';

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
        inspector: true,
        resolveOptions: { config: { components: {} } },
      });
      return <output>{String(data?.metadata.title ?? 'missing')}</output>;
    }

    expect(renderToString(<Preview />)).toBe('<output>initial plan</output>');
  });
});
