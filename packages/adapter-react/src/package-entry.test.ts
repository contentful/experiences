import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const entryUrl = (file: string): string =>
  pathToFileURL(fileURLToPath(new URL(`../dist/${file}`, import.meta.url))).href;

function localGraph(entry: string, declarations = false, seen = new Set<string>()): string {
  if (seen.has(entry)) return '';
  seen.add(entry);
  const url = new URL(entry);
  const source = readFileSync(url, 'utf8');
  const imports = ts.preProcessFile(source).importedFiles;
  return [
    source,
    ...imports
      .filter(({ fileName }) => fileName.startsWith('.'))
      .map(({ fileName }) =>
        localGraph(
          new URL(declarations ? fileName.replace(/\.js$/, '.d.ts') : fileName, url).href,
          declarations,
          seen
        )
      ),
  ].join('\n');
}

describe('published package entry points', () => {
  it.each(['index.js', 'server.js', 'client.js', 'custom-renderer.js', 'web-sdk.js', 'host.js'])(
    '%s imports without browser globals under Node ESM resolution',
    (file) => {
      expect(() =>
        execFileSync(process.execPath, [
          '--input-type=module',
          '--eval',
          `import(${JSON.stringify(entryUrl(file))})`,
        ])
      ).not.toThrow();
    }
  );

  it.each(['index', 'server'])('%s keeps the live browser SDK out of its graph', (entry) => {
    const graph = localGraph(entryUrl(`${entry}.js`));
    expect(graph).not.toContain('@contentful/experiences-web');
    expect(graph).not.toContain('client-renderer.js');
    expect(graph).not.toContain('use-experience-plan.js');
    expect(graph).not.toMatch(/from ['"]next(?:\/|['"])/);
  });

  it.each(['index', 'server', 'client', 'custom-renderer', 'web-sdk', 'host'])(
    '%s has no optional preview imports in JavaScript or declarations',
    (entry) => {
      for (const declarations of [false, true]) {
        const graph = localGraph(
          entryUrl(`${entry}.${declarations ? 'd.ts' : 'js'}`),
          declarations
        );
        expect(graph).not.toContain('@contentful/experiences-live-preview');
        expect(graph).not.toContain('use-live-preview');
      }
    }
  );

  it('preserves every per-file client directive in the unbundled output', () => {
    const directory = new URL('.', import.meta.url);
    for (const file of readdirSync(directory, { recursive: true, encoding: 'utf8' }).filter(
      (name) => /\.(?:ts|tsx)$/.test(name)
    )) {
      if (
        file.endsWith('.test.ts') ||
        file.endsWith('.test.tsx') ||
        file.replaceAll('\\', '/').startsWith('test/') ||
        file.replaceAll('\\', '/').startsWith('preview/legacy/')
      )
        continue;
      const source = readFileSync(new URL(file, directory), 'utf8');
      if (/^['"]use client['"];$/m.test(source)) {
        expect(readFileSync(new URL(entryUrl(file.replace(/\.tsx?$/, '.js'))), 'utf8')).toMatch(
          /^['"]use client['"];$/m
        );
      }
    }
  });

  it('declares compatible runtime dependencies without Next or required preview', () => {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(manifest.dependencies).not.toHaveProperty('@contentful/experiences-live-preview');
    expect(manifest.peerDependencies).not.toHaveProperty('next');
    expect(manifest.dependencies).not.toHaveProperty('next');
    const folders = {
      '@contentful/experiences-client': 'client',
      '@contentful/experiences-runtime': 'runtime',
      '@contentful/experiences-sdk-core': 'core',
      '@contentful/experiences-design': 'design',
      '@contentful/experiences-web': 'web',
    };
    for (const [name, folder] of Object.entries(folders)) {
      const dependency = JSON.parse(
        readFileSync(new URL(`../../${folder}/package.json`, import.meta.url), 'utf8')
      );
      expect(manifest.dependencies[name]).toBe(dependency.version);
    }
    expect(
      readdirSync(new URL('../dist/', import.meta.url), { recursive: true, encoding: 'utf8' }).some(
        (file) => /use-live-preview|preview[/\\]legacy|^test[/\\]/.test(file)
      )
    ).toBe(false);
  });

  it.each(['bundler', 'NodeNext'] as const)(
    'typechecks runtime ownership and context manual registration with %s resolution',
    (resolution) => {
      const filename = fileURLToPath(new URL('./published-runtime.tsx', import.meta.url));
      const source = `
        import { useCallback } from 'react';
        import {
          createReactExperiences, useExperiences, useExperiencesContext,
          useExperiencesActions, useConsentState, usePreviewState,
          type OnExperienceNodeRoot, type PortableRenderPlan
        } from '@contentful/experiences-react/client';
        import { createExperiencesRootSdkBinding, disposeExperiencesRootSdkBinding }
          from '@contentful/experiences-react/host';
        import { ContentfulExperiences, type ExperiencesWebConfig, type WebExperiencesRuntime,
          type CoreStates, type RuntimeLivePreviewInitializer }
          from '@contentful/experiences-react/web-sdk';

        const ui = createReactExperiences({ config: { components: {} } });
        declare const config: ExperiencesWebConfig;
        declare const livePreview: RuntimeLivePreviewInitializer;
        declare const plan: PortableRenderPlan;
        declare const sdk: ContentfulExperiences;
        function ManualContent() {
          const runtime: WebExperiencesRuntime = useExperiences();
          const registerView = useCallback<OnExperienceNodeRoot>(({ element, data }) => {
            if (!data) return;
            runtime.tracking.enableElement('views', element, { data });
            return () => runtime.tracking.clearElement('views', element);
          }, [runtime]);
          const { setConsent, trackEvent, setLocale } = useExperiencesActions();
          const consent: CoreStates['consent']['current'] = useConsentState();
          const preview: CoreStates['preview']['current'] = usePreviewState();
          const context: { sdk: WebExperiencesRuntime; error: Error | undefined;
            isLive: boolean; isContentReady: boolean } = useExperiencesContext();
          const track: WebExperiencesRuntime['track'] = trackEvent;
          const locale: WebExperiencesRuntime['setLocale'] = setLocale;
          void [consent, preview, context, track, locale, setConsent];
          return <ui.ExperienceRenderer experience={plan} trackViews={false} onNodeRoot={registerView} />;
        }
        const owned = <ui.ExperiencesRoot {...config} livePreview={livePreview}><ManualContent /></ui.ExperiencesRoot>;
        const injected = <ui.ExperiencesProvider sdk={sdk}><ManualContent /></ui.ExperiencesProvider>;
        const binding = createExperiencesRootSdkBinding({ sdk });
        const concrete: ContentfulExperiences = binding.sdk;
        disposeExperiencesRootSdkBinding(binding);
        void [owned, injected, concrete];
        // @ts-expect-error Destruction belongs to the SDK owner.
        useExperiencesActions().destroy();
        // @ts-expect-error Managed content loading belongs to the next phase.
        ui.Experience;
      `;
      const options: ts.CompilerOptions = {
        target: ts.ScriptTarget.ES2023,
        jsx: ts.JsxEmit.ReactJSX,
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
      const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([filename], options, host));
      expect(
        ts.formatDiagnosticsWithColorAndContext(diagnostics, {
          getCanonicalFileName: (file) => file,
          getCurrentDirectory: () => fileURLToPath(new URL('..', import.meta.url)),
          getNewLine: () => '\n',
        })
      ).toBe('');
    }
  );
});
