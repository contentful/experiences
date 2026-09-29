import {
  ApiClient as OptimizationApiClient,
  type ApiClientConfig as OptimizationApiClientConfig,
  type ExperienceApiClientConfig as OptimizationExperienceApiClientConfig,
  type InsightsApiClientConfig as OptimizationInsightsApiClientConfig,
} from '@contentful/optimization-api-client';

/** Stable configuration for the runtime-owned Optimization API client. */
export type RuntimeOptimizationConfig = {
  experienceBaseUrl?: OptimizationExperienceApiClientConfig['baseUrl'];
  insightsBaseUrl?: OptimizationInsightsApiClientConfig['baseUrl'];
  enabledFeatures?: OptimizationExperienceApiClientConfig['enabledFeatures'];
  fetchOptions?: OptimizationApiClientConfig['fetchOptions'];
};

type CreateRuntimeOptimizationClientOptions = RuntimeOptimizationConfig & {
  spaceId: string;
  environmentId: string;
};

export function createRuntimeOptimizationClient({
  spaceId,
  environmentId,
  experienceBaseUrl,
  insightsBaseUrl,
  enabledFeatures,
  fetchOptions,
}: CreateRuntimeOptimizationClientOptions): OptimizationApiClient {
  return new OptimizationApiClient({
    spaceId,
    environment: environmentId,
    fetchOptions,
    experience: {
      baseUrl: experienceBaseUrl,
      enabledFeatures,
    },
    insights: { baseUrl: insightsBaseUrl },
  });
}
