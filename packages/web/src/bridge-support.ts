import type { ExperienceState } from './interceptors.js';
import {
  CORE_BRIDGE_CAPABILITIES_SYMBOL,
  getCoreBridgeCapabilities,
  type CoreBridgeCapabilities,
} from './bridge-support/coreBridgeCapabilities.js';

export { CORE_BRIDGE_CAPABILITIES_SYMBOL };
export type {
  CoreBridgeCapabilities,
  CoreBridgeHost,
} from './bridge-support/coreBridgeCapabilities.js';

function getRequiredBridge(sdk: unknown): CoreBridgeCapabilities {
  const bridge = getCoreBridgeCapabilities(sdk);
  if (!bridge)
    throw new Error('Contentful Experiences SDK instance does not expose bridge support.');
  return bridge;
}

/** Hydrate already-fetched profile state through the live runtime's state interceptors. */
export async function hydrateOptimizationData(
  sdk: unknown,
  data: ExperienceState | undefined
): Promise<void> {
  if (!data) return;
  await getRequiredBridge(sdk).hydrateOptimizationData(data);
}
