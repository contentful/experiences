/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow Next to compile workspace packages from source rather than expecting
  // pre-built dist artifacts in node_modules. Useful for local development of
  // the SDK packages alongside this example.
  transpilePackages: [
    '@contentful/experiences-react',
    // Workspace-internal deps — Next still needs to compile their source
    // even though the customer's package.json only lists experiences-react.
    '@contentful/experiences-sdk-core',
    '@contentful/experiences-design',
  ],
};

export default nextConfig;
