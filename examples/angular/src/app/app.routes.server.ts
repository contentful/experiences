import { RenderMode, type ServerRoute } from '@angular/ssr';

/**
 * Every route is rendered per request. The default is `RenderMode.Prerender`,
 * which would try to reach the delivery API at build time — with no tokens
 * available — so it is explicitly overridden here.
 */
export const serverRoutes: ServerRoute[] = [{ path: '**', renderMode: RenderMode.Server }];
