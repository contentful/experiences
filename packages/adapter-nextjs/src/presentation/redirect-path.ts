/** Validate only SDK-owned navigation; raw results and custom callbacks remain application-owned. */
export function getRedirectError(path: string): TypeError | undefined {
  if (
    typeof path !== 'string' ||
    !path.startsWith('/') ||
    path.startsWith('//') ||
    /[\\\t\r\n]/.test(path) ||
    new globalThis.URL(path, 'https://redirect.invalid').pathname.startsWith('//')
  ) {
    return new TypeError('Destination redirect must be a local absolute path.');
  }
  return undefined;
}
