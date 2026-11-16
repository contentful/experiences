export function requireRouteKey(routeKey: string): void {
  if (!routeKey.startsWith('/')) {
    throw new TypeError('Current page requires a pathname/search route key');
  }
}
