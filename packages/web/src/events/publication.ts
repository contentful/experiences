import type { OptimizationEventStreamEvent } from '@contentful/experiences-runtime';
import { event as eventSignal } from '../signals/index.js';

export function publishEvent(event: OptimizationEventStreamEvent): void {
  try {
    eventSignal.value = event;
  } catch (error) {
    console.warn('Event stream subscriber failed', error);
  }
}
