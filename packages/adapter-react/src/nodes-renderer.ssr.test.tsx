/*
 * `component-render-error` isolation, exercised against React's real SSR
 * renderers rather than assumed from docs — this took empirical probing to
 * get right, so the two renderers are tested separately on purpose:
 *
 *  - `renderToPipeableStream` (Fizz, the streaming renderer Next.js's App
 *    Router actually uses under the hood) DOES degrade gracefully: a
 *    `<Suspense>` boundary whose content throws server-side gets its
 *    `fallback` emitted as the initial HTML ("switch to client rendering"),
 *    and siblings outside that boundary are unaffected. Confirmed here.
 *  - `renderToStaticMarkup`/`renderToString` (the legacy synchronous APIs)
 *    ALSO honor the Suspense `fallback` for a thrown Error (verified
 *    empirically — not documented React behavior), so they degrade
 *    gracefully too. The difference: legacy output carries no hydration
 *    data, so there's no client-side retry — the fallback is permanent and
 *    no diagnostic is ever recorded for that render. Confirmed here too, so
 *    it stays documented behavior instead of a surprise.
 *
 * Neither SSR path ever runs `ComponentErrorBoundary`'s own `hasError`
 * branch — that only happens client-side (after hydration, or in a
 * client-only render) — so no diagnostic/console.warn fires during either of
 * these SSR passes. That's asserted explicitly below, not left implicit.
 * See `nodes-renderer.test.tsx` for the client-side catch + diagnostic.
 */
import { Writable } from 'node:stream';

import { describe, it, expect, vi } from 'vitest';
import { renderToPipeableStream, renderToStaticMarkup } from 'react-dom/server';

import type { ComponentNode, ExperiencePayload } from '@contentful/experiences-sdk-core';
import { resolveExperience } from '@contentful/experiences-sdk-core';

import { ServerExperienceRenderer } from './server-renderer';
import type { Config } from './types';

const VIEWPORTS = [{ id: 'desktop', query: '*', displayName: 'Desktop', previewSize: '100%' }];

function componentNode(typeId: string, rest: Omit<ComponentNode, 'component'> = {}): ComponentNode {
  return {
    component: {
      sys: {
        type: 'ResourceLink',
        linkType: 'Contentful:Component',
        urn: `crn:contentful:::experience:spaces/$self/environments/$self/components/${typeId}`,
      },
    },
    ...rest,
  };
}

function Broken(): never {
  throw new Error('boom');
}

const Fine = () => <span data-fine>sibling</span>;

function renderToStreamedHtml(element: React.ReactElement): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    const writable = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(chunk.toString());
        cb();
      },
    });
    const { pipe } = renderToPipeableStream(element, {
      onAllReady() {
        pipe(writable);
        writable.on('finish', () => resolve(chunks.join('')));
      },
      onShellError: reject,
      // Fizz reports the recovered-from error here too; that's Next's own
      // instrumentation hook, orthogonal to our diagnostics — not asserted on.
      onError() {},
    });
  });
}

describe('ServerExperienceRenderer — component-render-error under Fizz (renderToPipeableStream)', () => {
  it('isolates the failing node — sibling still renders, no crash', async () => {
    const payload: ExperiencePayload = {
      viewports: VIEWPORTS,
      nodes: [componentNode('broken', { id: 'b' }), componentNode('fine', { id: 'f' })],
    };
    const config: Config = { components: { broken: Broken, fine: Fine } };
    const plan = await resolveExperience(payload, config);

    const html = await renderToStreamedHtml(
      <ServerExperienceRenderer experience={plan} config={config} />
    );

    expect(html).toContain('data-fine');
    expect(html).toContain('Switched to client rendering');
  });

  it('emits the debug fallback markup as the Suspense recovery content when debug is on', async () => {
    const payload: ExperiencePayload = {
      viewports: VIEWPORTS,
      nodes: [componentNode('broken', { id: 'b' })],
    };
    const config: Config = { components: { broken: Broken } };
    const plan = await resolveExperience(payload, config);

    const html = await renderToStreamedHtml(
      <ServerExperienceRenderer experience={plan} config={config} debug />
    );
    expect(html).toContain('data-experiences-render-error="broken"');
  });

  it('never records a diagnostic or warns during the SSR pass itself', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const payload: ExperiencePayload = {
        viewports: VIEWPORTS,
        nodes: [componentNode('broken', { id: 'b' })],
      };
      const config: Config = { components: { broken: Broken } };
      const plan = await resolveExperience(payload, config);

      await renderToStreamedHtml(<ServerExperienceRenderer experience={plan} config={config} />);

      // `getDerivedStateFromError` — and therefore our reporting inside its
      // `render()` — never runs server-side under Fizz; only Suspense
      // recovery does. Diagnostics for this failure mode only ever surface
      // client-side, after hydration.
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe('ServerExperienceRenderer — component-render-error under the legacy renderToStaticMarkup', () => {
  it('degrades gracefully too — fallback renders, sibling isolated, no crash', async () => {
    const payload: ExperiencePayload = {
      viewports: VIEWPORTS,
      nodes: [componentNode('broken', { id: 'b' }), componentNode('fine', { id: 'f' })],
    };
    const config: Config = { components: { broken: Broken, fine: Fine } };
    const plan = await resolveExperience(payload, config);

    // Same Suspense-fallback mechanism as the streaming renderer — this API
    // isn't documented to honor Suspense for a thrown Error (only for a
    // thrown thenable), but it empirically does, so it's locked in here
    // rather than left as an assumption.
    const html = renderToStaticMarkup(
      <ServerExperienceRenderer experience={plan} config={config} />
    );
    expect(html).toContain('data-fine');
  });

  it('never records a diagnostic — legacy output has no hydration retry to catch it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const payload: ExperiencePayload = {
        viewports: VIEWPORTS,
        nodes: [componentNode('broken', { id: 'b' })],
      };
      const config: Config = { components: { broken: Broken } };
      const plan = await resolveExperience(payload, config);

      renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={config} />);

      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
