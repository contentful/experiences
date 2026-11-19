// Vite inlines `import.meta.env.VITE_*` at build time, so these values ship to
// every visitor. Use an explicitly browser-designated delivery token or a
// trusted authenticated proxy; never put private server credentials here.
export const env = {
  spaceId: import.meta.env.VITE_SPACE_ID ?? '',
  destinationId: import.meta.env.VITE_DESTINATION_ID ?? '',
  environmentId: import.meta.env.VITE_ENVIRONMENT_ID || 'master',
  accessToken: import.meta.env.VITE_CDA_TOKEN ?? '',
  host: import.meta.env.VITE_DELIVERY_HOST ?? '',
};
