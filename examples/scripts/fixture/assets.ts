import type { AssetFixture } from './types.js';

// Source files live next to this module under `assets/`. The bootstrap reads
// them from disk and uploads to the caller's space — the demo has no runtime
// dependency on any external CDN.
export const assets: AssetFixture[] = [
  {
    tempId: 'asset:hero-bg',
    title: 'Hero background — blue connections',
    fileName: 'hero-bg.png',
    contentType: 'image/png',
    sourcePath: 'assets/hero-bg.png',
  },
  {
    tempId: 'asset:card-on',
    title: 'On case study image',
    fileName: 'card-on.png',
    contentType: 'image/png',
    sourcePath: 'assets/card-on.png',
  },
  {
    tempId: 'asset:card-guide',
    title: 'Developer guide image',
    fileName: 'card-guide.webp',
    contentType: 'image/webp',
    sourcePath: 'assets/card-guide.webp',
  },
];
