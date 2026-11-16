import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const packageName = '@contentful/experiences-nextjs';
const manifest = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
const entries = ['', '/client', '/server', '/custom-renderer', '/tracking-attributes'];

function runModule(source: string, forbidden: string[] = []): string {
  const loader = `
    export async function resolve(specifier, context, nextResolve) {
      const forbidden = ${JSON.stringify(['@contentful/experiences-live-preview', ...forbidden])};
      if (forbidden.some(name => specifier === name || specifier.startsWith(name + '/'))) {
        throw new Error('Unexpected eager import: ' + specifier);
      }
      return nextResolve(specifier, context);
    }
  `;
  return execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `
        import { register } from 'node:module';
        register(${JSON.stringify(`data:text/javascript,${encodeURIComponent(loader)}`)}, import.meta.url);
        globalThis.fetch = () => { throw new Error('Network calls are forbidden in package tests'); };
        ${source}
      `,
    ],
    { cwd: packageRoot, encoding: 'utf8' }
  );
}

describe('published package entries', () => {
  it('publishes only the implemented ESM surface and accepted framework peers', () => {
    expect(Object.keys(manifest.exports).sort()).toEqual(
      [
        '.',
        './client',
        './server',
        './custom-renderer',
        './tracking-attributes',
        './package.json',
      ].sort()
    );
    expect(manifest).toMatchObject({
      name: packageName,
      type: 'module',
      sideEffects: false,
      peerDependencies: { next: '^15.5.0', react: '^19.0.0', 'react-dom': '^19.0.0' },
    });
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/);
    const react = JSON.parse(
      readFileSync(path.join(packageRoot, '../adapter-react/package.json'), 'utf8')
    );
    const node = JSON.parse(readFileSync(path.join(packageRoot, '../node/package.json'), 'utf8'));
    expect(manifest.dependencies).toEqual({
      [react.name]: react.version,
      [node.name]: node.version,
    });
    for (const suffix of entries) {
      expect(manifest.exports[suffix ? `.${suffix}` : '.']).toEqual({
        import: {
          types: `./dist/${suffix ? suffix.slice(1) : 'index'}.d.ts`,
          default: `./dist/${suffix ? suffix.slice(1) : 'index'}.js`,
        },
      });
    }
  });

  it('has an empty root without loading React, Node, Web, or Next', () => {
    const result = runModule(
      `const root = await import('${packageName}'); process.stdout.write(JSON.stringify(Object.keys(root)));`,
      [
        '@contentful/experiences-react',
        '@contentful/experiences-node',
        '@contentful/experiences-web',
        'next',
      ]
    );
    expect(JSON.parse(result)).toEqual([]);
  });

  it.each(entries.filter(Boolean))('%s imports from dist without eager preview', (suffix) => {
    const forbidden = suffix === '/client' ? [] : ['@contentful/experiences-web'];
    expect(() => runModule(`await import('${packageName}${suffix}');`, forbidden)).not.toThrow();
  });

  it.each(['/client', '/server', '/custom-renderer'])(
    '%s preserves public React export identity',
    (suffix) => {
      const result = runModule(`
        const actual = await import('${packageName}${suffix}');
        const shared = await import('@contentful/experiences-react${suffix}');
        process.stdout.write(JSON.stringify({
          names: Object.keys(actual).sort(),
          sharedNames: Object.keys(shared).sort(),
          same: Object.keys(actual).every(name => actual[name] === shared[name])
        }));
      `);
      const { names, sharedNames, same } = JSON.parse(result);
      expect(names).toEqual(sharedNames);
      expect(same).toBe(true);
    }
  );

  it('exports working attribution helpers through the public server boundary', () => {
    const result = runModule(
      `
        const actual = await import('${packageName}/tracking-attributes');
        const shared = await import('@contentful/experiences-react/server');
        process.stdout.write(JSON.stringify({
          names: Object.keys(actual).sort(),
          same: Object.keys(actual).every(name => actual[name] === shared[name]),
          empty: actual.getTrackingAttributes(undefined),
          scopes: actual.getTrackingAttributes({ roots: [{ key: 'first' }, { key: 'second' }] })
        }));
      `,
      ['@contentful/experiences-web']
    );
    expect(JSON.parse(result)).toEqual({
      names: ['TRACKING_CLICKABLE_ATTRIBUTE', 'TRACKING_SCOPES_ATTRIBUTE', 'getTrackingAttributes'],
      same: true,
      empty: {},
      scopes: { 'data-ctfl-scopes': 'first second' },
    });
  });

  it('preserves the client directive only on the explicit client entry', () => {
    const client = readFileSync(path.join(packageRoot, 'dist/client.js'), 'utf8');
    expect(client).toMatch(/^['"]use client['"];\s/);
    expect(client).toContain('@contentful/experiences-react/client');
    for (const filename of [
      'index.js',
      'server.js',
      'custom-renderer.js',
      'tracking-attributes.js',
    ]) {
      expect(readFileSync(path.join(packageRoot, 'dist', filename), 'utf8')).not.toMatch(
        /['"]use client['"]/
      );
    }
  });

  it('keeps optional preview out of emitted declarations', () => {
    const declarations = readdirSync(path.join(packageRoot, 'dist')).filter((file) =>
      file.endsWith('.d.ts')
    );
    expect(declarations.sort()).toEqual(
      [
        'index.d.ts',
        'client.d.ts',
        'server.d.ts',
        'custom-renderer.d.ts',
        'tracking-attributes.d.ts',
      ].sort()
    );
    for (const filename of declarations) {
      expect(readFileSync(path.join(packageRoot, 'dist', filename), 'utf8')).not.toMatch(
        /experiences-live-preview|useLivePreview|fetchPreviewSession|PREVIEW_WEBSOCKET_HOST/
      );
    }
  });

  it('includes every declared entry and README in the npm package', () => {
    const output = execFileSync(
      'npm',
      ['pack', '--dry-run', '--json', '--ignore-scripts', '--workspaces=false', '--offline'],
      {
        cwd: packageRoot,
        encoding: 'utf8',
      }
    );
    const packed = JSON.parse(output);
    const archive = Array.isArray(packed) ? packed[0] : packed[packageName];
    const files = archive.files.map((file: { path: string }) => file.path);
    expect(files).toContain('README.md');
    expect(files).toContain('package.json');
    for (const suffix of entries) {
      const entry = manifest.exports[suffix ? `.${suffix}` : '.'].import;
      expect(files).toContain(entry.default.slice(2));
      expect(files).toContain(entry.types.slice(2));
    }
    expect(files.some((file: string) => /\.test\.|^src\//.test(file))).toBe(false);
  });
});

describe('published declarations', () => {
  it.each(['bundler', 'NodeNext'] as const)(
    'typechecks the surface with %s resolution',
    (resolution) => {
      // Compile an in-memory consumer inside this package, resolving its real exports to dist.
      const filename = path.join(packageRoot, 'src', 'published-surface.ts');
      const source = `
      import * as root from '${packageName}';
      import {
        ServerExperienceRenderer, defineComponent, fetchExperience, EventBuilder,
        type Config, type PortableRenderPlan, type ServerExperienceRendererProps
      } from '${packageName}/server';
      import {
        ExperienceRenderer, useExperiencePlan, useExperience, useDesignValues,
        type ExperienceRendererProps, type UseExperiencePlanOptions
      } from '${packageName}/client';
      import {
        resolveNodeProps, createExperienceNode, ExperienceNode,
        type NodeSnapshot, type ResolvedNode, type ExperienceNodeProps
      } from '${packageName}/custom-renderer';
      import { getTrackingAttributes, type TrackingAttributes } from '${packageName}/tracking-attributes';
      import { ServerExperienceRenderer as sharedServer } from '@contentful/experiences-react/server';
      import { ExperienceRenderer as sharedClient } from '@contentful/experiences-react/client';

      const server: typeof sharedServer = ServerExperienceRenderer;
      const client: typeof sharedClient = ExperienceRenderer;
      const config: Config = { components: {} };
      const serverProps: ServerExperienceRendererProps = { experience: null, config };
      const clientProps: ExperienceRendererProps = { experience: null, config };
      const attrs: TrackingAttributes = getTrackingAttributes(undefined);
      declare const plan: PortableRenderPlan;
      declare const hookOptions: UseExperiencePlanOptions;
      declare const snapshot: NodeSnapshot;
      declare const resolved: ResolvedNode;
      const nodeProps: ExperienceNodeProps = { node: snapshot };
      void [server, client, serverProps, clientProps, attrs, plan, hookOptions, resolved, nodeProps,
        fetchExperience, EventBuilder, defineComponent, useExperiencePlan, useExperience,
        useDesignValues, resolveNodeProps, createExperienceNode, ExperienceNode];
      // @ts-expect-error The root intentionally has no renderer exports.
      root.ExperienceRenderer;
      // @ts-expect-error Standalone preview hooks are not part of normal entries.
      import { useLivePreview } from '${packageName}/client';
      // @ts-expect-error Router binding belongs to a later phase.
      import { bindNextjsAppRouterServerExperiences } from '${packageName}/server';
    `;
      const options: ts.CompilerOptions = {
        rootDir: packageRoot,
        target: ts.ScriptTarget.ES2023,
        module: resolution === 'NodeNext' ? ts.ModuleKind.NodeNext : ts.ModuleKind.ESNext,
        moduleResolution:
          resolution === 'NodeNext'
            ? ts.ModuleResolutionKind.NodeNext
            : ts.ModuleResolutionKind.Bundler,
        strict: true,
        skipLibCheck: true,
        noEmit: true,
        types: ['node'],
      };
      const host = ts.createCompilerHost(options);
      const readFile = host.readFile.bind(host);
      const fileExists = host.fileExists.bind(host);
      host.readFile = (file) => (file === filename ? source : readFile(file));
      host.fileExists = (file) => file === filename || fileExists(file);
      const program = ts.createProgram([filename], options, host);
      const diagnostics = ts.getPreEmitDiagnostics(program);
      expect(
        ts.formatDiagnosticsWithColorAndContext(diagnostics, {
          getCanonicalFileName: (file) => file,
          getCurrentDirectory: () => packageRoot,
          getNewLine: () => '\n',
        })
      ).toBe('');
      const files = program.getSourceFiles().map((file) => file.fileName);
      for (const suffix of entries) {
        expect(files).toContain(
          path.join(packageRoot, 'dist', `${suffix ? suffix.slice(1) : 'index'}.d.ts`)
        );
      }
      expect(
        files.some((file) => /experiences-live-preview|packages\/live-preview\//.test(file))
      ).toBe(false);
    }
  );
});
