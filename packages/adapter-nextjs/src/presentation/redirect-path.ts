/** Validate only SDK-owned navigation; raw results and custom callbacks remain application-owned. */
export function localRedirectPath(path: string): string {
  if (
    typeof path !== 'string' ||
    !path.startsWith('/') ||
    path.startsWith('//') ||
    /[\\\t\r\n]/.test(path) ||
    new globalThis.URL(path, 'https://redirect.invalid').pathname.startsWith('//')
  ) {
    throw new TypeError('Destination redirect must be a local absolute path.');
  }
  return path;
}
