import {
  ApiClient as OptimizationApiClient,
  type ApiClientConfig as OptimizationApiClientConfig,
  type ExperienceApiClientConfig as PersonalizationApiClientConfig,
  type InsightsApiClientConfig as AnalyticsApiClientConfig,
} from '@contentful/optimization-api-client';

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
  locale?: string;
};

export function createRuntimeOptimizationClient({
  spaceId,
  environmentId,
  locale,
  personalizationBaseUrl,
  analyticsBaseUrl,
  personalizationEnabledFeatures,
  fetchOptions,
}: CreateRuntimeOptimizationClientOptions): OptimizationApiClient {
  return new OptimizationApiClient({
    spaceId,
    environment: environmentId,
    fetchOptions,
    experience: {
      baseUrl: personalizationBaseUrl,
      enabledFeatures: personalizationEnabledFeatures,
      locale,
    },
    insights: { baseUrl: analyticsBaseUrl },
  });
}
