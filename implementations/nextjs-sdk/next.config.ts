import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // All SDK code comes from installed, packed public packages.
  poweredByHeader: false,
  async headers() {
    return ['/', '/page-two', '/single-experience'].map((source) => ({
      source,
      headers: [{ key: 'Cache-Control', value: 'private, no-store' }],
    }));
  },
};

export default nextConfig;
