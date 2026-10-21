import { defineConfig } from '@rslib/core';
import packageJson from './package.json';

const entry = {
  index: './src/index.ts',
  'sdk-info': './src/sdk-info.ts',
  runtime: './src/runtime.ts',
  'tracking-attributes': './src/tracking-attributes.ts',
  'bridge-support': './src/bridge-support.ts',
};

const autoExternal = {
  dependencies: true,
  peerDependencies: true,
  optionalDependencies: true,
  devDependencies: false,
} as const;

export default defineConfig({
  source: {
    tsconfigPath: './tsconfig.lib.json',
    define: {
      __DEFAULT_EVENT_CONTEXT_LIBRARY_NAME__: JSON.stringify(packageJson.name),
      __DEFAULT_EVENT_CONTEXT_LIBRARY_VERSION__: JSON.stringify(
        process.env.RELEASE_VERSION ?? packageJson.version
      ),
    },
  },
  output: {
    target: 'web',
  },
  lib: [
    {
      format: 'esm',
      syntax: 'es2022',
      bundle: true,
      autoExtension: false,
      source: { entry },
      output: {
        autoExternal,
        distPath: { root: 'dist' },
        filename: { js: '[name].js' },
        sourceMap: true,
        cleanDistPath: true,
        minify: true,
      },
      // Shared types must retain one identity across the root and runtime subpath.
      dts: { bundle: false, build: false },
      redirect: { dts: { path: false } },
    },
    {
      format: 'cjs',
      syntax: 'es2022',
      bundle: true,
      autoExtension: false,
      source: { entry },
      output: {
        autoExternal,
        distPath: { root: 'dist' },
        filename: { js: '[name].cjs' },
        sourceMap: true,
        cleanDistPath: false,
        minify: true,
      },
      dts: false,
    },
    {
      format: 'umd',
      syntax: 'es2022',
      umdName: 'ContentfulExperiences',
      bundle: true,
      autoExtension: false,
      source: {
        entry: { 'contentful-experiences-web.umd': './src/contentful-experiences.ts' },
      },
      output: {
        autoExternal: false,
        distPath: { root: 'dist' },
        filename: { js: '[name].js' },
        sourceMap: true,
        cleanDistPath: false,
        minify: true,
      },
      dts: false,
      tools: {
        rspack: {
          output: {
            globalObject: 'globalThis',
            library: { type: 'umd', export: 'ContentfulExperiences' },
          },
        },
      },
    },
  ],
});
