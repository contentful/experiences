import type { ExperiencePayload, PortableRenderPlan } from '@contentful/experiences-sdk-core';
import { resolveExperience } from '@contentful/experiences-sdk-core';
import type { ReactNode } from 'react';
import { Writable } from 'node:stream';
import { renderToPipeableStream, renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Config } from '../registry/types';
import { componentNode } from '../test/fixtures/payload.js';
import { useExperience } from './context';
import { ServerExperienceRenderer } from './server-renderer';
describe('ServerExperienceRenderer', () => {
  it('renders null when plan is null/undefined', () => {
    expect(
      renderToStaticMarkup(
        <ServerExperienceRenderer experience={null} config={{ components: {} }} />
      )
    ).toBe('');
    expect(
      renderToStaticMarkup(
        <ServerExperienceRenderer experience={undefined} config={{ components: {} }} />
      )
    ).toBe('');
  });

  it('exposes experience context via useExperience() with debug false by default', async () => {
    const seen: Array<Record<string, unknown>> = [];
    const Capture = () => {
      seen.push(useExperience() as unknown as Record<string, unknown>);
      return null;
    };
    const captureConfig: Config = { components: { capture: Capture } };
    const plan = await resolveExperience({ nodes: [componentNode('capture')] }, captureConfig);
    renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={captureConfig} />);

    expect(seen).toEqual([
      {
        debug: false,
        metadata: {},
      },
    ]);
  });

  it('renders missing-component fallback in debug mode', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const justContainer: Config = {
      components: {
        'contentful-container': ({ children }: { children?: ReactNode }) => <div>{children}</div>,
      },
    };
    const planWithMissing: PortableRenderPlan = {
      metadata: {},
      debug: false,
      diagnostics: [],
      nodes: [
        {
          nodeId: 'root',
          registration: { kind: 'component', id: 'contentful-container' },
          props: { content: {}, design: {}, designRaw: {} },
          slots: {
            children: [
              {
                nodeId: 'ghost',
                registration: { kind: 'component', id: 'NotRegistered' },
                props: { content: {}, design: {}, designRaw: {} },
                slots: {},
              },
            ],
          },
        },
      ],
    };

    const debugHtml = renderToStaticMarkup(
      <ServerExperienceRenderer experience={planWithMissing} config={justContainer} debug />
    );
    expect(debugHtml).toContain('data-experiences-missing="NotRegistered"');

    const productionHtml = renderToStaticMarkup(
      <ServerExperienceRenderer experience={planWithMissing} config={justContainer} />
    );
    expect(productionHtml).not.toContain('data-experiences-missing');
    expect(productionHtml).toBe(
      '<div data-ctfl-attribution="{&quot;scopes&quot;:{}}" style="display:contents"><div></div></div>'
    );

    warn.mockRestore();
  });

  it('auto-mounts DebugExperience only when debug is on', async () => {
    const captureConfig: Config = { components: { capture: () => null } };
    const plan = await resolveExperience({ nodes: [componentNode('capture')] }, captureConfig);

    const off = renderToStaticMarkup(
      <ServerExperienceRenderer experience={plan} config={captureConfig} />
    );
    expect(off).not.toContain('data-experiences-debug');

    const on = renderToStaticMarkup(
      <ServerExperienceRenderer experience={plan} config={captureConfig} debug />
    );
    expect(on).toContain('data-experiences-debug');
    expect(on).toContain('Experience debug');
  });

  it('threads top-level metadata into useExperience()', async () => {
    let seen: Record<string, unknown> | null = null;
    const Capture = () => {
      seen = useExperience() as unknown as Record<string, unknown>;
      return null;
    };
    const captureConfig: Config = { components: { capture: Capture } };
    const plan = await resolveExperience({ nodes: [componentNode('capture')] }, captureConfig);
    renderToStaticMarkup(
      <ServerExperienceRenderer
        experience={plan}
        config={captureConfig}
        metadata={{ slug: 'home', locale: 'en-US' }}
      />
    );
    expect(seen!.metadata).toEqual({ slug: 'home', locale: 'en-US' });
  });

  describe('ServerExperienceRenderer — render context carried on the plan', () => {
    function captureSetup() {
      const seen: Array<Record<string, unknown>> = [];
      const Capture = () => {
        seen.push(useExperience() as unknown as Record<string, unknown>);
        return null;
      };
      const config: Config = { components: { capture: Capture } };
      return { seen, config };
    }

    const payload = (): ExperiencePayload => ({
      nodes: [componentNode('capture')],
    });

    it('reads metadata off the plan without it being passed to the renderer', async () => {
      const { seen, config } = captureSetup();
      const plan = await resolveExperience(payload(), config, {
        metadata: { slug: 'home', locale: 'en-US' },
      });

      renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={config} />);

      expect(seen[0]!.metadata).toEqual({ slug: 'home', locale: 'en-US' });
    });

    it('reads debug off the plan without it being passed to the renderer', async () => {
      const { seen, config } = captureSetup();
      const plan = await resolveExperience(payload(), config, { debug: true });

      renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={config} />);

      expect(seen[0]!.debug).toBe(true);
    });

    it('shallow-merges the metadata prop over the plan value', async () => {
      const { seen, config } = captureSetup();
      const plan = await resolveExperience(payload(), config, {
        metadata: { slug: 'home', locale: 'en-US' },
      });

      renderToStaticMarkup(
        <ServerExperienceRenderer
          experience={plan}
          config={config}
          metadata={{ locale: 'de-DE', extra: true }}
        />
      );

      expect(seen[0]!.metadata).toEqual({ slug: 'home', locale: 'de-DE', extra: true });
    });

    it('lets an explicit debug={false} override a plan fetched with debug on', async () => {
      const { seen, config } = captureSetup();
      const plan = await resolveExperience(payload(), config, { debug: true });

      renderToStaticMarkup(
        <ServerExperienceRenderer experience={plan} config={config} debug={false} />
      );

      expect(seen[0]!.debug).toBe(false);
    });

    it('lets an explicit debug override a plan fetched without it', async () => {
      const { seen, config } = captureSetup();
      const plan = await resolveExperience(payload(), config);

      renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={config} debug />);

      expect(seen[0]!.debug).toBe(true);
    });

    it('varies context per render by spreading the plan', async () => {
      // The plan is the only channel for `metadata` / `debug`, so a per-render
      // change means deriving a new plan. Spreading is shallow, so the nodes
      // keep their identity.
      const { seen, config } = captureSetup();
      const plan = await resolveExperience(payload(), config, { metadata: { slug: 'home' } });

      const derived = {
        ...plan,
        debug: true,
        metadata: { ...plan.metadata, viewer: 'anon' },
      };
      renderToStaticMarkup(<ServerExperienceRenderer experience={derived} config={config} />);

      expect(seen[0]!.debug).toBe(true);
      expect(seen[0]!.metadata).toEqual({ slug: 'home', viewer: 'anon' });
      expect(derived.nodes).toBe(plan.nodes);
    });

    it('renders the debug panel from the plan alone', async () => {
      const config: Config = { components: { capture: () => null } };
      const plan = await resolveExperience(payload(), config, { debug: true });

      const html = renderToStaticMarkup(
        <ServerExperienceRenderer experience={plan} config={config} />
      );

      expect(html).toContain('<details');
    });
  });
});

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

describe('ServerExperienceRenderer recovery wiring', () => {
  it('isolates the failing node — sibling still renders, no crash', async () => {
    const payload: ExperiencePayload = {
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
});
