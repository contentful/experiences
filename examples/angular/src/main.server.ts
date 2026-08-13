import type { BootstrapContext } from '@angular/platform-browser';
import { bootstrapApplication } from '@angular/platform-browser';

import { AppComponent } from './app/app.component.js';
import { appConfigServer } from './app/app.config.server.js';

/**
 * `context` must be threaded through or Angular throws NG0401 — the SSR runtime
 * uses it to attach the per-request injector.
 */
export default function bootstrap(context: BootstrapContext) {
  return bootstrapApplication(AppComponent, appConfigServer, context);
}
