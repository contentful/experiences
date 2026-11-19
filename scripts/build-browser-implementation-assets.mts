import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

function browserAssetConfig(root: string, dist: string, entry: string, name: string) {
  return {
    configFile: false as const,
    root,
    publicDir: false as const,
    build: {
      outDir: dist,
      emptyOutDir: false,
      target: 'es2022',
      sourcemap: true,
      lib: { entry: resolve(root, entry), formats: ['es' as const], fileName: () => name },
    },
  };
}

// Maintainer: prepare these references from locally packed/installed SDK
// artifacts, so verification exercises the consumer distribution.
/** Use each standalone app's tools and installed artifacts. */
export async function buildBrowserImplementationAssets(
  root: string,
  build: (
    config: ReturnType<typeof browserAssetConfig> & { define?: Record<string, string> }
  ) => Promise<unknown>,
  parse: (source: Buffer) => Record<string, string>,
  extraFiles: readonly string[] = []
) {
  const dist = resolve(root, 'public/dist');
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });
  // Copy installed artifacts, never workspace sources or an adjacent checkout.
  const umd = 'contentful-experiences-web.umd.js';
  for (const file of [umd, `${umd}.map`])
    await cp(
      resolve(root, 'node_modules/@contentful/experiences-web/dist', file),
      resolve(dist, file)
    );
  for (const file of extraFiles) await cp(resolve(root, file), resolve(dist, basename(file)));

  // Rich Text and tracking helpers use native ESM; the SDK retains its classic UMD.
  await build(browserAssetConfig(root, dist, 'scripts/rich-text.ts', 'rich-text.js'));

  // Build and host retain the same app-local deployment setting.
  const localEnvironment = resolve(root, '.env');
  const previewEnabled =
    parse(
      readFileSync(existsSync(localEnvironment) ? localEnvironment : `${localEnvironment}.example`)
    ).LIVE_PREVIEW_ENABLED === 'true';
  await build({
    // Disabled builds tree-shake the optional Preview package and its protocol dependencies.
    ...browserAssetConfig(root, dist, 'src/preview.ts', 'preview.js'),
    define: { __LIVE_PREVIEW_ENABLED__: JSON.stringify(previewEnabled) },
  });
}
