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

  it('exports event context that preserves request metadata through the Node facade', () => {
    const result = runModule(`
      const server = await import('${packageName}/server');
      const sdk = server.configureServerExperiences({
        spaceId: 'space', environmentId: 'master', delivery: { accessToken: 'server-token' }
      });
      const request = sdk.forRequest({
        eventContext: server.createEventContext({
          request: {
            url: 'https://example.com/page?tag=a&tag=b',
            headers: new Headers({ referer: 'https://referrer.test', 'user-agent': 'browser' })
          }
        })
      });
      try {
        const event = request.eventBuilder.buildPageView();
        process.stdout.write(JSON.stringify({
          page: event.context.page,
          userAgent: event.context.userAgent,
          hasOldHelper: 'createRequestContext' in server
        }));
      } finally {
        request.destroy();
        sdk.destroy();
      }
    `);
    expect(JSON.parse(result)).toEqual({
      page: {
        path: '/page',
        search: '?tag=a&tag=b',
        query: { tag: ['a', 'b'] },
        referrer: 'https://referrer.test',
        url: 'https://example.com/page?tag=a&tag=b',
      },
      userAgent: 'browser',
      hasOldHelper: false,
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
      import { bindAppRouterServerExperiences as bindAppServer } from '${packageName}/app-router/server';
      import { bindAppRouterClientExperiences, AppRouterRequestRoot, AppRouterRequestAnalyticsRoot, type RequestResult } from '${packageName}/app-router/client';
      import { bindPagesRouterServerExperiences } from '${packageName}/pages-router/server';
      import { bindPagesRouterExperiences, PagesRouterRequestRoot, PagesRouterRequestAnalyticsRoot, type DefaultRequestRootProps } from '${packageName}/pages-router';
      import { createPublicPermutationCacheMiddleware } from '${packageName}/cache-middleware';
      import { createExperiencesContextHandler, type ExperiencesContextHandlerOptions } from '${packageName}/request-handler';
      import {
        configureServerExperiences, bindExperiencesRequest,
        createEventContext, type CreateEventContextOptions,
        createRouteKey, serializePlan, serializeHandoff,
        createPrivateFetch, assertPublicRequestPolicy,
        applyPrivateResponseCache, persistAnonymousId,
        type RequestRuntime, type BindExperiencesRequestOptions,
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

      const sdk = configureServerExperiences({
        spaceId: 'space', environmentId: 'master', delivery: { accessToken: 'server-token' }
      });
      const eventContextOptions: CreateEventContextOptions = {
        request: { url: 'https://example.com/page', headers: new Headers() },
        locale: 'en-US'
      };
      const eventContextRequest: RequestRuntime = sdk.forRequest({
        consent: false, eventContext: createEventContext(eventContextOptions)
      });
      eventContextRequest.destroy();
      // @ts-expect-error The helper is named for the event metadata it returns.
      import { createRequestContext } from '${packageName}/server';
      // @ts-expect-error The options type follows the event-context helper name.
      import { type CreateRequestContextOptions } from '${packageName}/server';
      const request = bindExperiencesRequest(sdk, { consent: false, locale: 'en-US' });
      const actualRequest: RequestRuntime = request;
      const response = { headers: new Headers() };
      applyPrivateResponseCache(response);
      persistAnonymousId(response, request, { cookieOptions: { httpOnly: true } });
      request.destroy();
      // @ts-expect-error The unpublished binding wrapper has been removed.
      import { type ExperiencesRequestBinding } from '${packageName}/server';
      // @ts-expect-error The direct Node request has no response persistence closure.
      request.persist(response);
      const unsupportedBindOptions: BindExperiencesRequestOptions = {
        consent: false,
        // @ts-expect-error Cookie response options belong to standalone persistence or middleware.
        cookieOptions: { httpOnly: true }
      };
      const unsupportedWithdrawalOptions: BindExperiencesRequestOptions = {
        consent: false,
        // @ts-expect-error Withdrawal policy belongs to response persistence.
        deleteWhenProfileCannotPersist: false
      };
      void [unsupportedBindOptions, unsupportedWithdrawalOptions];
      // @ts-expect-error Consent is required independently of request cookies.
      bindExperiencesRequest(sdk, { locale: 'en-US' });
      const handlerOptions: ExperiencesContextHandlerOptions = { sdk, consent: false, cookieOptions: { httpOnly: true }, deleteWhenProfileCannotPersist: false };
      const contextHandler = createExperiencesContextHandler(handlerOptions);
      const explicitRequest = bindExperiencesRequest(sdk, { consent: false, request: { url: 'https://example.com/?preview_session_id=session', headers: new Headers() } });
      // @ts-expect-error Next derives session identity from the incoming request.
      bindExperiencesRequest(sdk, { consent: false, preview: { sessionId: 'override' } });
      const unsupportedHandlerOptions: ExperiencesContextHandlerOptions = {
        sdk, consent: false,
        // @ts-expect-error Next derives session identity without an application resolver.
        preview: () => ({ sessionId: 'override' })
      };
      explicitRequest.destroy();
      void unsupportedHandlerOptions;
      assertPublicRequestPolicy({ cache: { scope: 'static' }, context: { consent: false } });
      void [actualRequest, contextHandler, createRouteKey, serializePlan,
        serializeHandoff, createPrivateFetch];
      const server: typeof sharedServer = ServerExperienceRenderer;
      const client: typeof sharedClient = ExperienceRenderer;
      const config: Config = { components: {} };
      const appServer = bindAppServer({ spaceId: 'space', environmentId: 'master', delivery: { accessToken: 'server' }, config });
      const browserApp = bindAppServer({
        spaceId: 'space', environmentId: 'master', delivery: { accessToken: 'server' }, config,
        browser: { delivery: { host: 'https://example.com/api/delivery' } },
        cookie: { expires: 7, sameSite: 'lax' },
        consent: { server: false, clientDefaults: { consent: false, persistenceConsent: false } },
        request: { experience: { experienceId: 'home' }, resolveOptions: { metadata: { server: true }, debug: false } }
      });
      browserApp.request.loadExperience({ mode: 'ssr' }).then(primary => { const id: string = primary.experienceId; void id; });
      browserApp.request.loadExperience({ experience: { experienceId: 'other', locale: 'de-DE' } });
      browserApp.request.loadExperience({ experience: { destinationId: 'site', nodeId: 'node' } }).then(primary => { const node: string = primary.experience.nodeId; void node; });
      appServer.Experience({ destinationId: 'site', path: '/page' });
      // @ts-expect-error Source selectors remain exclusive.
      browserApp.request.loadExperience({ experience: { experienceId: 'home', destinationId: 'site', path: '/page' } });
      // @ts-expect-error Destination paths and nodes remain exclusive.
      appServer.Experience({ destinationId: 'site', nodeId: 'node', path: '/page' });
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
      Experience({ renderError: () => null });
      // @ts-expect-error DOM event handlers cannot cross the request RSC boundary.
      Experience({ rootProps: { onClick: () => {} } });
      // @ts-expect-error Custom components belong in the client binding.
      Experience({ as: () => null });
      appServer.Experience({ experience: plan, renderError: () => null });
      const composedApp = bindAppServer({ spaceId: 'space', environmentId: 'master', delivery: { accessToken: 'server' }, config, request: {
        experience: { experienceId: 'home', locale: 'en', parameters: { variant: 'home' } },
        composeRequest: async (request, primary, context) => {
          const facade: RequestRuntime = request;
          // @ts-expect-error Composition is shared by default and overridden selectors.
          const id: string = primary.experienceId;
          void [facade, id, primary.plan, primary.error, context.routeKey];
        }
      } });
      import { serializeRequestResult } from '${packageName}/app-router/server';
      composedApp.request.loadExperience({ experience: { experienceId: 'other' } }).then(primary => {
        const id: string = primary.experienceId;
        const descriptorId: string = serializeRequestResult(primary).experience.experienceId;
        void [id, descriptorId];
      });
      const sourceDefaults = { spaceId: 'space', environmentId: 'master', delivery: { accessToken: 'server' }, config };
      composedApp.request.loadExperience().then(primary => { const id: string = primary.experienceId; void id; });
      composedApp.request.loadExperience(undefined).then(primary => { const id: string = primary.experienceId; void id; });
      composedApp.request.loadExperience({ experience: async context => ({ destinationId: 'site', path: context.routeKey }) }).then(primary => {
        const path: string = primary.experience.path;
        // @ts-expect-error A Destination override may redirect or fail without an ID.
        const id: string = primary.experienceId;
        void [id, path];
      });
      declare const optionalSelector: import('${packageName}/app-router/server').ServerRequestOverrides | undefined;
      declare const conditionalOverride: { experience: { destinationId: string; path: string } } | { consent: boolean };
      composedApp.request.loadExperience(optionalSelector).then(primary => {
        // @ts-expect-error An optional selector can choose the default or a Destination.
        const id: string = primary.experienceId; void id;
      });
      composedApp.request.loadExperience(conditionalOverride).then(primary => {
        // @ts-expect-error Conditional overrides can select a Destination or the default.
        const id: string = primary.experienceId; void id;
      });
      const destinationApp = bindAppServer({ ...sourceDefaults, request: { experience: { destinationId: 'site', path: '/' } } });
      destinationApp.request.loadExperience({ experience: { experienceId: 'other' } }).then(primary => { const id: string = primary.experienceId; void id; });
      const mixedApp = bindAppServer({ ...sourceDefaults, request: { experience: () => Math.random() ? { experienceId: 'home' } : { destinationId: 'site', nodeId: 'node' } } });
      mixedApp.request.loadExperience().then(primary => {
        // @ts-expect-error Mixed defaults retain optional identity.
        const id: string = primary.experienceId; void id;
      });
      declare const createPreviewClient: import('@contentful/experiences-runtime').PreviewClientFactory;
      const previewConfig: import('${packageName}/app-router/client').PreviewConfig = {
        createClient: createPreviewClient,
      };
      // @ts-expect-error Sessions are selected by the URL, never shared configuration.
      const explicitSession: typeof previewConfig = { sessionId: 'session' };
      // @ts-expect-error Preview activation is derived, with no deployment switch.
      const disabledPreview: typeof previewConfig = { enabled: false };
      const appClient = bindAppRouterClientExperiences({ config, preview: previewConfig });
      const automaticApp = bindAppServer({
        spaceId: 'space', environmentId: 'master', delivery: { accessToken: 'server' }, config,
      }, { request: { Experience: appClient.request.Experience, ExperiencesRoot: appClient.request.ExperiencesRoot } });
      automaticApp.request.Experience({ as: 'section', rootProps: { id: 'content' } });
      // @ts-expect-error Client renderer callbacks belong in the injected client module.
      automaticApp.request.Experience({ renderError: () => null });
      // @ts-expect-error DOM handlers cannot cross the server-to-client boundary.
      automaticApp.request.Experience({ rootProps: { onClick: () => {} } });
      bindAppServer({ spaceId: 'space', environmentId: 'master', delivery: { accessToken: 'server' }, config,
        // @ts-expect-error Factory-only browser configuration lacks server transport credentials.
        preview: previewConfig, request: { experience: { experienceId: 'home' } } });
      const serverPreview: import('${packageName}/server').PreviewConfig = { accessToken: 'preview' };
      const appPreview: import('${packageName}/app-router/server').PreviewConfig = { accessToken: () => 'preview' };
      const pagesPreview: import('${packageName}/pages-router/server').PreviewConfig = { host: 'https://example.com/preview' };
      // @ts-expect-error Server Preview configuration requires credentials or a proxy host.
      const emptyServerPreview: typeof serverPreview = {};
      // @ts-expect-error An explicitly undefined token still requires a proxy host.
      const undefinedAppPreview: typeof appPreview = { accessToken: undefined };
      // @ts-expect-error Server factories do not supply transport credentials.
      const factoryPagesPreview: typeof pagesPreview = { createClient: createPreviewClient };
      for (const preview of [serverPreview, appPreview, pagesPreview]) {
        bindAppServer({ spaceId: 'space', environmentId: 'master', delivery: { accessToken: 'server' }, config, preview });
        bindPagesRouterServerExperiences({ spaceId: 'space', environmentId: 'master', delivery: { accessToken: 'server' }, config, preview });
      }
      void [emptyServerPreview, undefinedAppPreview, factoryPagesPreview];
      // @ts-expect-error Content identity belongs to Experience, not the shared root.
      appClient.ExperiencesRoot({ experienceId: 'home' });
      // @ts-expect-error Analytics observes the SDK Preview target without a root content ID.
      appClient.ExperiencesAnalyticsRoot({ experienceId: 'home' });
      const standaloneRoot = { spaceId: 'space', environmentId: 'master', browser: { delivery: { host: 'https://example.com/api/delivery' } } };
      AppRouterRequestRoot(standaloneRoot);
      // @ts-expect-error Standalone request roots do not select content by ID.
      AppRouterRequestRoot({ ...standaloneRoot, experienceId: 'home' });
      // @ts-expect-error Standalone analytics roots observe the SDK, not a supplied content ID.
      AppRouterRequestAnalyticsRoot({ ...standaloneRoot, experienceId: 'home' });
      const pagesServer = bindPagesRouterServerExperiences({ spaceId: 'space', environmentId: 'master', delivery: { accessToken: 'server' }, config, origin: 'https://example.com', request: { experience: async () => ({ experienceId: 'home' }), composeRequest: (_request, primary) => { const id: string | undefined = primary.experienceId; void id; } } });
      pagesServer.request.loadExperience({} as import('next').GetServerSidePropsContext).then(primary => { const id: string = primary.experience.experienceId; void id; });
      pagesServer.request.loadExperience({} as import('next').GetServerSidePropsContext, { experience: async context => ({ destinationId: 'site', path: context.routeKey }) }).then(primary => { const path: string = primary.experience.path; void path; });
      const pagesWithoutOrigin = bindPagesRouterServerExperiences({ ...sourceDefaults });
      // @ts-expect-error A Pages origin remains required on the binding or loader call.
      pagesWithoutOrigin.request.loadExperience({} as import('next').GetServerSidePropsContext);
      pagesWithoutOrigin.request.loadExperience({} as import('next').GetServerSidePropsContext, { origin: 'https://example.com' });
      declare const pagesOptions: Parameters<typeof pagesServer.request.loadExperience>[1];
      const composedPagesOptions: typeof pagesOptions = {
        ...pagesOptions,
        composeRequest: async (request, primary, context) => {
          const facade: RequestRuntime = request;
          void [facade, primary.plan, primary.error, context.routeKey];
        }
      };
      const pagesClient = bindPagesRouterExperiences({
        config, spaceId: 'space', environmentId: 'master',
        delivery: { accessToken: 'browser' }, preview: previewConfig,
        consent: { clientDefaults: { consent: false, persistenceConsent: false } }
      });
      declare const result: RequestResult;
      const explicitApp = <appClient.request.ExperiencesRoot result={result}>
        <appClient.request.Experience />
        <appClient.Experience experienceId="footer" />
      </appClient.request.ExperiencesRoot>;
      const explicitPages = <pagesClient.request.ExperiencesRoot result={result}>
        <pagesClient.request.Experience />
        <pagesClient.Experience experienceId="footer" />
      </pagesClient.request.ExperiencesRoot>;
      // @ts-expect-error Readonly SDK mode is not a root configuration control.
      const explicitMode = <appClient.request.ExperiencesRoot isPreview />;
      void [explicitApp, explicitPages, explicitSession, disabledPreview, explicitMode];
      {
        const { ExperiencesRoot, Experience } = appClient.request;
        // @ts-expect-error Request roots infer content identity from their result.
        ExperiencesRoot({ experienceId: 'home' });
        // @ts-expect-error Request analytics roots do not select an Experience.
        appClient.request.ExperiencesAnalyticsRoot({ experienceId: 'home' });
        const tree = <ExperiencesRoot result={result}><Experience result={result} as="section" /><Experience /></ExperiencesRoot>;
        void tree;
        // @ts-expect-error Descriptor overlays cannot change the supplied request result.
        Experience({ result, experienceId: 'different' });
        // @ts-expect-error Seeds are part of the complete request result.
        Experience({ result, initialPlan: plan });
        // @ts-expect-error Request roots obtain handoff from their result.
        ExperiencesRoot({ result, handoff: result.handoff });
      }
      {
        const { ExperiencesRoot, ExperiencesAnalyticsRoot, Experience } = pagesClient.request;
        // @ts-expect-error Pages request roots do not select content by ID.
        ExperiencesRoot({ experienceId: 'home' });
        // @ts-expect-error Pages analytics observes the SDK Preview target.
        ExperiencesAnalyticsRoot({ experienceId: 'home' });
        // @ts-expect-error Ordinary Pages roots also leave identity to Experience.
        pagesClient.ExperiencesRoot({ experienceId: 'home' });
        // @ts-expect-error Ordinary Pages analytics does not select content.
        pagesClient.ExperiencesAnalyticsRoot({ experienceId: 'home' });
        const tree = <ExperiencesRoot result={result}><Experience result={result} as="section" /><Experience /></ExperiencesRoot>;
        const analytics = <ExperiencesAnalyticsRoot result={result}><p>Server content</p></ExperiencesAnalyticsRoot>;
        void [tree, analytics];
        pagesClient.Experience({ experienceId: 'home', initialPlan: plan, parameters: { variant: 'home' } });
        pagesClient.Experience({ experience: plan });
        pagesClient.ExperienceRenderer({ experience: plan });
        pagesClient.useManagedExperience({ experienceId: 'home' });
        pagesClient.Experience({ destinationId: 'site', path: '/page', onRedirect: ({ path }) => { void path; } });
        pagesClient.useManagedExperience({ destinationId: 'site', nodeId: 'node', locale: 'de-DE' });
        appClient.Experience({ destinationId: 'site', path: '/page' });
        appClient.useManagedExperience({ destinationId: 'site', nodeId: 'node' });
        // @ts-expect-error Destination descriptor overlays cannot change a supplied request result.
        Experience({ result, destinationId: 'site', path: '/page' });
        const defaultRootProps: DefaultRequestRootProps = {
          spaceId: 'space', environmentId: 'master', result,
          browser: { delivery: { accessToken: 'browser' } }
        };
        const standalone = <PagesRouterRequestRoot {...defaultRootProps}><Experience result={result} /></PagesRouterRequestRoot>;
        const standaloneAnalytics = <PagesRouterRequestAnalyticsRoot {...defaultRootProps}><p>Server content</p></PagesRouterRequestAnalyticsRoot>;
        void [standalone, standaloneAnalytics];
        // @ts-expect-error Ordinary Web Experience does not consume a server request result.
        pagesClient.Experience({ result });
        // @ts-expect-error Request roots obtain handoff from their result.
        ExperiencesRoot({ result, handoff: result.handoff });
        // @ts-expect-error Descriptor overlays cannot change the supplied request result.
        Experience({ result, experienceId: 'different' });
        // @ts-expect-error Seeds are part of the complete request result.
        Experience({ result, initialPlan: plan });
      }
      pagesServer.request.loadExperience({ resolvedUrl: '/home' } as Parameters<typeof pagesServer.request.loadExperience>[0], pagesOptions);
      // @ts-expect-error Request server roots cannot receive browser callbacks.
      ExperiencesRoot({ beforeInitialPage: () => {} });
      const tree = <ExperiencesRoot><Experience {...requestProps} /></ExperiencesRoot>;
      const cacheMiddleware = createPublicPermutationCacheMiddleware({ resolveCache: () => undefined });
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
      import { bindAppRouterServerExperiences } from '${packageName}/server';
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
