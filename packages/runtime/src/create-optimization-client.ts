import {
  ApiClient as OptimizationApiClient,
  type ApiClientConfig as OptimizationApiClientConfig,
  type ExperienceApiClientConfig as PersonalizationApiClientConfig,
  type InsightsApiClientConfig as AnalyticsApiClientConfig,
} from '@contentful/optimization-api-client';
import type { RuntimeOptimizationApiClient } from './runtime-event-methods.js';

/** Stable configuration for the runtime-owned Optimization API client. */
export type RuntimeOptimizationConfig = {
  personalizationBaseUrl?: PersonalizationApiClientConfig['baseUrl'];
  analyticsBaseUrl?: AnalyticsApiClientConfig['baseUrl'];
  personalizationEnabledFeatures?: PersonalizationApiClientConfig['enabledFeatures'];
  fetchOptions?: OptimizationApiClientConfig['fetchOptions'];
};

type CreateRuntimeOptimizationClientOptions = RuntimeOptimizationConfig & {
  spaceId: string;
  environmentId: string;
};

export function createRuntimeOptimizationClient({
  spaceId,
  environmentId,
  personalizationBaseUrl,
  analyticsBaseUrl,
  personalizationEnabledFeatures,
  fetchOptions,
}: CreateRuntimeOptimizationClientOptions): RuntimeOptimizationApiClient {
  const client = new OptimizationApiClient({
    spaceId,
    environment: environmentId,
    fetchOptions,
    experience: {
      baseUrl: personalizationBaseUrl,
      enabledFeatures: personalizationEnabledFeatures,
    },
    insights: { baseUrl: analyticsBaseUrl },
  });

  return {
    personalization: client.experience,
    analytics: client.insights,
  };
}
