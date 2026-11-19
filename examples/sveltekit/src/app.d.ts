import type { ManagedRequestSource } from '@contentful/experiences-svelte/kit/client';

declare global {
  namespace App {
    interface Locals {
      exoDocumentOutcome?: { routeKey: string; notFound: boolean; redirect?: string };
    }
    interface PageData {
      primarySource?: ManagedRequestSource;
    }
  }
}

export {};
