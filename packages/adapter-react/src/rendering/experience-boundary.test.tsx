/** @vitest-environment jsdom */
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';
import { ExperienceBoundary } from './experience-boundary';

const experience: PortableRenderPlan = {
  nodes: [],
  metadata: {},
  debug: false,
  diagnostics: [],
  attribution: {
    scopes: { root: { key: 'root', entityId: 'home', entityKind: 'Experience', variantIndex: 0 } },
  },
};

describe('ExperienceBoundary', () => {
  it('renders its children under one attributed default container', () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(
      <ExperienceBoundary experience={experience}>
        <article>content</article>
      </ExperienceBoundary>
    );
    const boundary = container.firstElementChild!;
    expect(boundary.tagName).toBe('DIV');
    expect(boundary.getAttribute('style')).toBe('display:contents');
    expect(JSON.parse(boundary.getAttribute('data-ctfl-attribution')!).scopes).toHaveProperty(
      'root'
    );
    expect(boundary.children).toHaveLength(1);
    expect(boundary.firstElementChild?.tagName).toBe('ARTICLE');
  });

  it('makes repeated plans distinct DOM boundaries', () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(
      <>
        <ExperienceBoundary experience={experience}>
          <article />
        </ExperienceBoundary>
        <ExperienceBoundary experience={experience}>
          <article />
        </ExperienceBoundary>
      </>
    );
    const boundaries = container.querySelectorAll('[data-ctfl-attribution]');
    expect(boundaries).toHaveLength(2);
    expect(boundaries[0]).not.toBe(boundaries[1]);
    expect(boundaries[0]!.getAttribute('data-ctfl-attribution')).toBe(
      boundaries[1]!.getAttribute('data-ctfl-attribution')
    );
  });

  it('emits an empty inner boundary when its plan lacks attribution', () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(
      <ExperienceBoundary experience={experience}>
        <ExperienceBoundary experience={{ ...experience, attribution: undefined }}>
          <article />
        </ExperienceBoundary>
      </ExperienceBoundary>
    );
    const boundaries = container.querySelectorAll('[data-ctfl-attribution]');
    expect(boundaries).toHaveLength(2);
    expect(JSON.parse(boundaries[1]!.getAttribute('data-ctfl-attribution')!)).toEqual({
      scopes: {},
    });
    expect(boundaries[1]!.querySelector('[data-ctfl-scopes]')).toBeNull();
  });

  it('uses the requested semantic element, merges root props and preserves owned attribution', () => {
    const html = renderToString(
      <table>
        <ExperienceBoundary
          experience={experience}
          as="tbody"
          rootProps={{
            id: 'rows',
            'data-ctfl-attribution': 'caller',
            style: { display: 'table-row-group' },
          }}
        >
          <tr>
            <td>row</td>
          </tr>
        </ExperienceBoundary>
      </table>
    );
    expect(html).toMatch(/^<table><tbody /);
    const container = document.createElement('div');
    container.innerHTML = html;
    expect(container.querySelector('tbody')?.id).toBe('rows');
    expect(
      JSON.parse(container.querySelector('tbody')!.getAttribute('data-ctfl-attribution')!).scopes
    ).toHaveProperty('root');
    expect(container.querySelector('tbody')?.style.display).toBe('table-row-group');
    expect(html).not.toContain('<div');
  });
});
