import { resolve } from 'node:path';
import { build } from 'vite';
import { parse } from 'dotenv';
import { buildBrowserImplementationAssets } from '../../../scripts/build-browser-implementation-assets.mjs';

await buildBrowserImplementationAssets(resolve(import.meta.dirname, '..'), build, parse, [
  'dist/shared.js',
]);
