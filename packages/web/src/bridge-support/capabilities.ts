import type { ExperienceState } from '../interceptors.js';
import {
  CORE_BRIDGE_CAPABILITIES_SYMBOL,
  type CoreBridgeCapabilities,
} from './coreBridgeCapabilities.js';

export function installCoreBridgeCapabilities(
  host: object,
  hydrateOptimizationData: (data: ExperienceState) => Promise<void>
): void {
  const capabilities: CoreBridgeCapabilities = { hydrateOptimizationData };
  Object.defineProperty(host, CORE_BRIDGE_CAPABILITIES_SYMBOL, {
    configurable: false,
    enumerable: false,
    value: capabilities,
    writable: false,
  });
}
