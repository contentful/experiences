import type { PersonalizationDelivery } from '@contentful/experiences-runtime';

/**
 * Start the Personalization teardown drain and handle its completion.
 */
export function flushPersonalizationOnDestroy(delivery: PersonalizationDelivery): void {
  void delivery.flushOnDestroy().catch((error: unknown) => {
    console.warn(
      '[@contentful/experiences] Failed to flush Personalization queue during destroy()',
      error
    );
  });
}
