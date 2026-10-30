// Vite inlines `import.meta.env.VITE_*` at build time, so these values ship to
// every visitor. That is fine for a read-only delivery token and nothing else.
export const env = {
  spaceId: import.meta.env.VITE_SPACE_ID ?? '',
  environmentId: import.meta.env.VITE_ENVIRONMENT_ID || 'master',
  accessToken: import.meta.env.VITE_CDA_TOKEN ?? '',
};
