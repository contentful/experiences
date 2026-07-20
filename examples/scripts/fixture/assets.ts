import type { AssetFixture } from './types.js';

// Source URLs come from the shared demo test space (w65h2sqzlqap). The bootstrap
// downloads each and re-uploads it as an asset in the caller's target space.
export const assets: AssetFixture[] = [
  {
    tempId: 'asset:hero-bg',
    title: 'Hero background — blue connections',
    fileName: 'hero-bg.png',
    contentType: 'image/png',
    sourceUrl:
      'https://images.ctfassets.net/w65h2sqzlqap/4pbxgJHy3kvCmS6Y7S0Dz6/d9158fd0e10cbb3731b2125e8fefd272/background-blue-connections.png',
  },
  {
    tempId: 'asset:card-on',
    title: 'On case study image',
    fileName: 'card-on.png',
    contentType: 'image/png',
    sourceUrl:
      'https://images.ctfassets.net/w65h2sqzlqap/1sY0RBemn8qu4chA0kHeqE/6a65a4b54d797ca87300e575e6085ac1/Generic-blue-cart.png',
  },
  {
    tempId: 'asset:card-guide',
    title: 'Developer guide image',
    fileName: 'card-guide.webp',
    contentType: 'image/webp',
    sourceUrl:
      'https://images.ctfassets.net/w65h2sqzlqap/5VeMf09DxYNyLPfalm7Lde/c928d2407fd8f4c4d3c92b356b237b50/build-faster.webp',
  },
];
