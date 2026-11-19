import type { ManagedRequestSource } from '@contentful/experiences-svelte/kit/client';
import type { PublicEnvironment } from '../public-config';
declare global {
  const __REFERENCE_ENVIRONMENT__: PublicEnvironment;
  const __LIVE_PREVIEW_ENABLED__: boolean;
  namespace App {
    interface Error {
      message: string;
    }
    interface Locals {
      exoDocumentOutcome?: { routeKey: string; notFound: boolean };
    }
    interface PageData {
      primarySource?: ManagedRequestSource;
      reference?: import('#lib/reference.js').ReferenceRoute;
      comparisons?: import('#lib/reference.js').Comparison[];
      configurationError?: string;
    }
  }
}
export {};
