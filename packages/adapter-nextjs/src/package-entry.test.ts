import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const packageName = '@contentful/experiences-nextjs';
const manifest = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
const entries = [
  '',
  '/client',
  '/server',
  '/custom-renderer',
  '/tracking-attributes',
  '/request-handler',
  '/app-router/server',
  '/app-router/client',
  '/pages-router',
  '/pages-router/server',
  '/cache-middleware',
];
const entryFile = (suffix: string) =>
  ({
    '/app-router/server': 'app-router-server',
    '/app-router/client': 'app-router-client',
    '/pages-router/server': 'pages-router-server',
  })[suffix] ?? (suffix ? suffix.slice(1) : 'index');

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
        './request-handler',
        './package.json',
        './app-router/server',
        './app-router/client',
        './pages-router',
        './pages-router/server',
        './cache-middleware',
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
          types: `./dist/${entryFile(suffix)}.d.ts`,
          default: `./dist/${entryFile(suffix)}.js`,
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
    const forbidden = ['/client', '/app-router/client', '/pages-router'].includes(suffix)
      ? []
      : suffix === '/app-router/server'
        ? []
        : ['@contentful/experiences-web', 'next/headers'];
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
          same: Object.keys(shared).every(name => actual[name] === shared[name])
        }));
      `);
      const { names, sharedNames, same } = JSON.parse(result);
      expect(names).toEqual(expect.arrayContaining(sharedNames));
      if (suffix !== '/server') expect(names).toEqual(sharedNames);
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
      'request-handler.js',
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
      const filename = path.join(packageRoot, 'src', 'published-surface.tsx');
      const source = `
      import * as root from '${packageName}';
      import { bindNextjsAppRouterServerExperiences as bindAppServer } from '${packageName}/app-router/server';
      import { bindNextjsAppRouterClientExperiences, type NextjsRequestResult } from '${packageName}/app-router/client';
      import { bindNextjsPagesRouterServerExperiences } from '${packageName}/pages-router/server';
      import { bindNextjsPagesRouterExperiences } from '${packageName}/pages-router';
      import { createNextjsPublicPermutationCacheMiddleware } from '${packageName}/cache-middleware';
      import { createNextjsExperiencesContextHandler, type NextjsLivePreviewResolver, type NextjsExperiencesContextHandlerOptions } from '${packageName}/request-handler';
      import {
        configureNextjsServerExperiences, bindNextjsExperiencesRequest,
        createNextjsRouteKey, serializeNextjsPlan, serializeNextjsHandoff,
        createNextjsPrivateFetch, assertNextjsPublicRequestPolicy,
        applyNextjsPrivateResponseCache, persistNextjsAnonymousId,
        type ExperiencesNodeRequest, type BindNextjsExperiencesRequestOptions,
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

      const sdk = configureNextjsServerExperiences({
        spaceId: 'space', environmentId: 'master', delivery: { accessToken: 'server-token' }
      });
      const request = bindNextjsExperiencesRequest(sdk, { consent: false, locale: 'en-US' });
      const actualRequest: ExperiencesNodeRequest = request;
      const response = { headers: new Headers() };
      applyNextjsPrivateResponseCache(response);
      persistNextjsAnonymousId(response, request, { cookieOptions: { httpOnly: true } });
      request.destroy();
      // @ts-expect-error The unpublished binding wrapper has been removed.
      import { type NextjsExperiencesRequestBinding } from '${packageName}/server';
      // @ts-expect-error The direct Node request has no response persistence closure.
      request.persist(response);
      const unsupportedBindOptions: BindNextjsExperiencesRequestOptions = {
        consent: false,
        // @ts-expect-error Cookie response options belong to standalone persistence or middleware.
        cookieOptions: { httpOnly: true }
      };
      const unsupportedWithdrawalOptions: BindNextjsExperiencesRequestOptions = {
        consent: false,
        // @ts-expect-error Withdrawal policy belongs to response persistence.
        deleteWhenProfileCannotPersist: false
      };
      void [unsupportedBindOptions, unsupportedWithdrawalOptions];
      // @ts-expect-error Consent is required independently of request cookies.
      bindNextjsExperiencesRequest(sdk, { locale: 'en-US' });
      declare const initializer: NonNullable<Parameters<typeof sdk.forRequest>[0]>['livePreview'];
      const livePreview: NextjsLivePreviewResolver = async ({ request }) => request.url.includes('preview') ? initializer : undefined;
      const handlerOptions: NextjsExperiencesContextHandlerOptions = { sdk, consent: false, livePreview, isPreview: true, cookieOptions: { httpOnly: true }, deleteWhenProfileCannotPersist: false };
      const contextHandler = createNextjsExperiencesContextHandler(handlerOptions);
      const explicitRequest = bindNextjsExperiencesRequest(sdk, { consent: false, livePreview: initializer });
      // @ts-expect-error Handler livePreview resolves an initializer, not a preview-policy record.
      const unsupportedPolicy: NextjsLivePreviewResolver = () => ({ isPreview: true });
      // @ts-expect-error The handler does not accept an initializer directly as its resolver.
      const unsupportedInitializer: NextjsLivePreviewResolver = initializer!;
      const unsupportedHandlerOptions: NextjsExperiencesContextHandlerOptions = {
        sdk, consent: false,
        // @ts-expect-error There is one application-owned livePreview resolver.
        previewResolver: livePreview
      };
      explicitRequest.destroy();
      void [unsupportedPolicy, unsupportedInitializer, unsupportedHandlerOptions];
      assertNextjsPublicRequestPolicy({ cache: { scope: 'static' }, context: { consent: false } });
      void [actualRequest, contextHandler, createNextjsRouteKey, serializeNextjsPlan,
        serializeNextjsHandoff, createNextjsPrivateFetch];
      const server: typeof sharedServer = ServerExperienceRenderer;
      const client: typeof sharedClient = ExperienceRenderer;
      const config: Config = { components: {} };
      const appServer = bindAppServer({ spaceId: 'space', environmentId: 'master', delivery: { accessToken: 'server' }, config });
      const browserApp = bindAppServer({
        spaceId: 'space', environmentId: 'master', delivery: { accessToken: 'server' }, config,
        browser: { delivery: { host: 'https://example.com/api/delivery' } },
        cookie: { expires: 7, sameSite: 'lax' },
        consent: { server: false, clientDefaults: { consent: false, persistenceConsent: false } },
        request: { experience: { experienceId: 'home' }, hydration: 'preserve-server', resolveOptions: { metadata: { server: true }, debug: false } }
      }, { request: { Experience: () => null } });
      browserApp.request.loadExperience({ resolveOptions: { debug: true } });
      // @ts-expect-error High-level expiry uses days; Date belongs to explicit low-level cookie helpers.
      bindAppServer({ spaceId: 'space', environmentId: 'master', delivery: { accessToken: 'server' }, config, cookie: { expires: new Date() } });
      // @ts-expect-error Server request state cannot become browser startup defaults.
      bindAppServer({ spaceId: 'space', environmentId: 'master', delivery: { accessToken: 'server' }, config, consent: { clientDefaults: { profile: { id: 'server' } } } });
      // @ts-expect-error A browser token supplier is a function and cannot cross the RSC boundary.
      bindAppServer({ spaceId: 'space', environmentId: 'master', delivery: { accessToken: 'server' }, config, browser: { delivery: { accessToken: () => 'browser' } } });
      const { ExperiencesRoot, Experience } = appServer.request;
      const requestProps: Parameters<typeof Experience>[0] = {
        as: 'section', rootProps: { id: 'experience', 'data-host': 'root' }
      };
      // @ts-expect-error Ordinary renderer callbacks must be configured in the client module.
      Experience({ renderError: () => null });
      // @ts-expect-error DOM event handlers cannot cross the request RSC boundary.
      Experience({ rootProps: { onClick: () => {} } });
      // @ts-expect-error Custom components belong in the client binding.
      Experience({ as: () => null });
      appServer.Experience({ experience: plan, renderError: () => null });
      bindAppServer({ spaceId: 'space', environmentId: 'master', delivery: { accessToken: 'server' }, config, request: {
        experience: { experienceId: 'home' },
        composeRequest: async (request, primary, context) => {
          const facade: ExperiencesNodeRequest = request;
          void [facade, primary.plan, primary.error, context.routeKey];
        }
      } });
      const appClient = bindNextjsAppRouterClientExperiences({ config });
      const pagesServer = bindNextjsPagesRouterServerExperiences({ spaceId: 'space', environmentId: 'master', delivery: { accessToken: 'server' }, config, request: { experience: { experienceId: 'home' } } });
      declare const pagesOptions: Parameters<typeof pagesServer.request.loadExperience>[1];
      const composedPagesOptions: typeof pagesOptions = {
        ...pagesOptions,
        composeRequest: async (request, primary, context) => {
          const facade: ExperiencesNodeRequest = request;
          void [facade, primary.plan, primary.error, context.routeKey];
        }
      };
      const pagesClient = bindNextjsPagesRouterExperiences({
        config, spaceId: 'space', environmentId: 'master',
        delivery: { accessToken: 'browser' },
        consent: { clientDefaults: { consent: false, persistenceConsent: false } }
      });
      declare const result: NextjsRequestResult;
      {
        const { ExperiencesRoot, Experience } = appClient.request;
        const tree = <ExperiencesRoot result={result}><Experience result={result} as="section" /></ExperiencesRoot>;
        void tree;
        // @ts-expect-error Descriptor overlays cannot change the supplied request result.
        Experience({ result, experienceId: 'different' });
        // @ts-expect-error Seeds are part of the complete request result.
        Experience({ result, initialPlan: plan });
        // @ts-expect-error Request roots obtain handoff from their result.
        ExperiencesRoot({ result, handoff: result.handoff });
      }
      {
        const { ExperiencesRoot, ExperiencesAnalyticsRoot, Experience, ExperienceRenderer: PagesExperienceRenderer, useManagedExperience } = pagesClient;
        const tree = <ExperiencesRoot result={result}><Experience result={result} as="section" /></ExperiencesRoot>;
        const analytics = <ExperiencesAnalyticsRoot result={result}><p>Server content</p></ExperiencesAnalyticsRoot>;
        void [tree, analytics];
        Experience({ experienceId: 'home', initialPlan: plan, parameters: { variant: 'home' } });
        Experience({ experience: plan });
        PagesExperienceRenderer({ experience: plan });
        useManagedExperience({ experienceId: 'home' });
        // @ts-expect-error Descriptor overlays cannot change the supplied request result.
        Experience({ result, experienceId: 'different' });
        // @ts-expect-error Seeds are part of the complete request result.
        Experience({ result, initialPlan: plan });
      }
      pagesServer.request.loadExperience({ resolvedUrl: '/home' } as Parameters<typeof pagesServer.request.loadExperience>[0], pagesOptions);
      // @ts-expect-error Request server roots cannot receive browser callbacks.
      ExperiencesRoot({ beforeInitialPage: () => {} });
      const tree = <ExperiencesRoot><Experience {...requestProps} /></ExperiencesRoot>;
      const cacheMiddleware = createNextjsPublicPermutationCacheMiddleware({ resolveCache: () => undefined });
      void [appServer, appClient, pagesServer, pagesClient, cacheMiddleware, requestProps, composedPagesOptions, tree];
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
      // @ts-expect-error Request-aware components require their opt-in router entry.
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
        jsx: ts.JsxEmit.ReactJSX,
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
        expect(files).toContain(path.join(packageRoot, 'dist', `${entryFile(suffix)}.d.ts`));
      }
      expect(
        files.some((file) => /experiences-live-preview|packages\/live-preview\//.test(file))
      ).toBe(false);
    }
  );
});
