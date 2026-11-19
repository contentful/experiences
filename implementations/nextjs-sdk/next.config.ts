import type { NextConfig } from 'next';
import { parse } from 'dotenv';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const livePreviewEnabled =
  parse(readFileSync(resolve(process.cwd(), '.env'))).LIVE_PREVIEW_ENABLED === 'true';

const nextConfig: NextConfig = {
  // All SDK code comes from installed, packed public packages.
  poweredByHeader: false,
  env: { NEXT_PUBLIC_LIVE_PREVIEW_ENABLED: String(livePreviewEnabled) },
  async headers() {
    return ['/', '/page-two', '/pages', '/pages/page-two'].map((source) => ({
      source,
      headers: [{ key: 'Cache-Control', value: 'private, no-store' }],
    }));
  },
};

export default nextConfig;
