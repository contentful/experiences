import type { ExperiencePayload } from '@contentful/experiences-sdk-core';
import { resolveExperience } from '@contentful/experiences-sdk-core';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { useDesignValues } from '../../hooks/use-design-values';
import type { Config } from '../../registry/types';
import { ServerExperienceRenderer } from '../../rendering/server-renderer';
import {
  componentNode,
  dt,
  experienceTemplateNode,
  m,
  sysWithExperienceTemplate,
} from '../../test/fixtures/payload.js';

const Container = ({ children }: { children?: ReactNode }) => {
  const design = useDesignValues();
  return <div data-padding={design.cfPadding as string}>{children}</div>;
};
const Heading = ({ text }: { text?: string }) => {
  const design = useDesignValues();
  return <h1 style={{ fontSize: design.cfFontSize as string }}>{text}</h1>;
};
const SimpleButton = ({ label }: { label?: string }) => {
  const design = useDesignValues();
  return (
    <button type="button" style={{ background: design.cfBackgroundColor as string }}>
      {label}
    </button>
  );
};
const config: Config = {
  components: {
    'contentful-container': Container,
    'contentful-heading': Heading,
    'contentful-button': SimpleButton,
  },
};
const payload: ExperiencePayload = {
  nodes: [
    componentNode('contentful-container', {
      id: 'page',
      contentProperties: {},
      designProperties: {
        cfPadding: m('40px'),
      },
      slots: {
        children: [
          componentNode('contentful-heading', {
            id: 'heading',
            contentProperties: { text: 'Build faster' },
            designProperties: {
              cfFontSize: m('32px'),
            },
          }),
          componentNode('contentful-button', {
            id: 'btn',
            contentProperties: { label: 'Get started' },
            designProperties: {
              cfBackgroundColor: m('#4f39f6'),
            },
          }),
        ],
      },
    }),
  ],
};
describe('Core payload resolution to renderer', () => {
  it('renders a nested experience with design props', async () => {
    const plan = await resolveExperience(payload, config);
    const html = renderToStaticMarkup(
      <ServerExperienceRenderer experience={plan} config={config} />
    );

    expect(html).toContain('data-padding="40px"');
    expect(html).toContain('font-size:32px');
    expect(html).toContain('background:#4f39f6');
    expect(html).toContain('Build faster');
    expect(html).toContain('Get started');
  });

  it('treats an explicitly-empty content value as set (beats a non-empty default)', async () => {
    const Item = ({ label }: { label: string }) => <span data-label={label} />;
    const itemConfig: Config = {
      components: {
        item: { component: Item, defaults: { label: 'fromDefault' } },
      },
    };
    const plan = await resolveExperience(
      {
        nodes: [
          componentNode('item', {
            id: 'i',
            contentProperties: { label: '' },
          }),
        ],
      },
      itemConfig
    );
    const html = renderToStaticMarkup(
      <ServerExperienceRenderer experience={plan} config={itemConfig} />
    );
    expect(html).toContain('data-label=""');
  });

  it('renders composite siblings without a template wrapper — sys.experienceTemplate is ignored', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const Item = ({ value }: { value?: string }) => <span>{value}</span>;
    // `hero` is registered as a template, but the nodes are plain components,
    // so no template may wrap them; only the Experience boundary is added.
    const cfg: Config = {
      components: { item: Item },
      experienceTemplates: {
        hero: ({ content }: { content?: ReactNode[] }) => <main>{content}</main>,
      },
    };
    const plan = await resolveExperience(
      {
        sys: sysWithExperienceTemplate('hero'),
        nodes: [
          componentNode('item', { id: 'a', contentProperties: { value: 'one' } }),
          componentNode('item', { id: 'b', contentProperties: { value: 'two' } }),
        ],
      },
      cfg
    );
    const html = renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={cfg} />);
    expect(html).toBe(
      '<div data-ctfl-attribution="{&quot;scopes&quot;:{}}" style="display:contents"><span>one</span><span>two</span></div>'
    );
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('renders slot children unwrapped + warns when the experienceTemplate is not registered', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const Item = ({ value }: { value?: string }) => <span>{value}</span>;
    const cfg: Config = { components: { item: Item } };
    const tplPayload: ExperiencePayload = {
      nodes: [
        experienceTemplateNode('missing-experienceTemplate', {
          id: 'tpl',
          slots: {
            content: [
              componentNode('item', { id: 'i', contentProperties: { value: 'unwrapped' } }),
            ],
          },
        }),
      ],
    };
    const plan = await resolveExperience(tplPayload, cfg);
    const html = renderToStaticMarkup(
      <ServerExperienceRenderer experience={plan} config={cfg} debug />
    );
    // The subtree survives — an unregistered template must not blank the page.
    expect(html).toContain('<span>unwrapped</span>');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('missing-experienceTemplate'));
    expect(html).toContain('data-experiences-debug-errors');
    expect(html).toContain(
      'No experience template registered for id &quot;missing-experienceTemplate&quot;'
    );
    warn.mockRestore();
  });

  describe('ServerExperienceRenderer — resolveToken', () => {
    // Reads its background through useDesignValues() — the resolved value the
    // renderer publishes on context, not an injected prop.
    const Button = ({ label }: { label?: string }) => {
      const design = useDesignValues();
      return (
        <button type="button" data-bg={design.cfBackgroundColor as string}>
          {label}
        </button>
      );
    };

    it('passes DesignToken values through the resolver before render', async () => {
      const cfg: Config = {
        components: { button: Button },
        resolveToken: (ref) => (ref.value === 'color/surface/hero' ? '#4f39f6' : undefined),
      };
      const plan = await resolveExperience(
        {
          nodes: [
            componentNode('button', {
              id: 'b',
              contentProperties: { label: 'Go' },
              designProperties: { cfBackgroundColor: dt('color/surface/hero') },
            }),
          ],
        },
        cfg
      );
      const html = renderToStaticMarkup(
        <ServerExperienceRenderer experience={plan} config={cfg} />
      );
      expect(html).toContain('data-bg="#4f39f6"');
      expect(html).not.toContain('DesignToken');
    });

    it('warns and passes the raw token through the design values when the resolver returns undefined', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      let captured: Record<string, unknown> = {};
      const Probe = () => {
        captured = useDesignValues();
        return null;
      };
      const cfg: Config = {
        components: { button: Probe },
        resolveToken: () => undefined,
      };
      const plan = await resolveExperience(
        {
          nodes: [
            componentNode('button', {
              id: 'b',
              contentProperties: { label: 'Go' },
              designProperties: { cfBackgroundColor: dt('color/unknown') },
            }),
          ],
        },
        cfg
      );
      renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={cfg} />);

      expect(captured.cfBackgroundColor).toEqual(dt('color/unknown'));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('color/unknown'));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('button'));
      warn.mockRestore();
    });

    it('leaves token values untouched when no resolver is supplied (backward-compatible)', async () => {
      const cfg: Config = { components: { button: Button } };
      const plan = await resolveExperience(
        {
          nodes: [
            componentNode('button', {
              id: 'b',
              contentProperties: { label: 'Go' },
              designProperties: { cfBackgroundColor: dt('color/surface/hero') },
            }),
          ],
        },
        cfg
      );
      const html = renderToStaticMarkup(
        <ServerExperienceRenderer experience={plan} config={cfg} />
      );
      // React stringifies the token object into "[object Object]" — the key
      // point is that the raw token value reaches the component, unchanged.
      expect(html).toContain('data-bg="[object Object]"');
    });

    it('runs on an experienceTemplate node design props too', async () => {
      const Tpl = ({ content }: { content?: ReactNode[] }) => {
        const design = useDesignValues();
        return <main data-bg={design.cfBackground as string}>{content}</main>;
      };
      const Item = ({ value }: { value?: string }) => <span>{value}</span>;
      const cfg: Config = {
        components: { item: Item },
        experienceTemplates: { page: Tpl },
        resolveToken: (ref) => (ref.value === 'brand/canvas' ? '#111827' : undefined),
      };
      const tplPayload: ExperiencePayload = {
        nodes: [
          experienceTemplateNode('page', {
            id: 'tpl',
            designProperties: { cfBackground: dt('brand/canvas') },
            slots: {
              content: [componentNode('item', { id: 'i', contentProperties: { value: 'ok' } })],
            },
          }),
        ],
      };
      const plan = await resolveExperience(tplPayload, cfg);
      const html = renderToStaticMarkup(
        <ServerExperienceRenderer experience={plan} config={cfg} />
      );
      expect(html).toContain('data-bg="#111827"');
    });
  });

  it('returns the resolved design values for the current node', async () => {
    let captured: Record<string, unknown> = {};
    const Probe = () => {
      captured = useDesignValues();
      return null;
    };
    const cfg: Config = {
      components: { probe: Probe },
      resolveToken: (ref) => (ref.value === 'brand/primary' ? '#4f39f6' : undefined),
    };
    const plan = await resolveExperience(
      {
        nodes: [
          componentNode('probe', {
            id: 'p',
            designProperties: {
              cfBackgroundColor: dt('brand/primary'),
              cfPadding: m('24px'),
            },
          }),
        ],
      },
      cfg
    );
    renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={cfg} />);
    expect(captured).toEqual({ cfBackgroundColor: '#4f39f6', cfPadding: '24px' });
  });
});
