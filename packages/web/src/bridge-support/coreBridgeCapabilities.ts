import type { ExperienceState } from '../interceptors.js';

export const CORE_BRIDGE_CAPABILITIES_SYMBOL = Symbol.for(
  'ctfl.experiences.internal.bridgeSupport'
);

/** State hydration capabilities exposed by compatible SDK instances. */
export interface CoreBridgeCapabilities {
  readonly hydrateOptimizationData: (data: ExperienceState) => Promise<void>;
}

export interface CoreBridgeHost {
  readonly [CORE_BRIDGE_CAPABILITIES_SYMBOL]?: CoreBridgeCapabilities;
}

export function getCoreBridgeCapabilities(sdk: unknown): CoreBridgeCapabilities | undefined {
  if (sdk === null || (typeof sdk !== 'object' && typeof sdk !== 'function')) return undefined;
  if (!hasCoreBridgeCapabilities(sdk)) return undefined;
  return sdk[CORE_BRIDGE_CAPABILITIES_SYMBOL];
}

function hasCoreBridgeCapabilities(host: object): host is CoreBridgeHost {
  return CORE_BRIDGE_CAPABILITIES_SYMBOL in host;
}
