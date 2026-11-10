import {
  ApiClient as OptimizationApiClient,
  type ApiClientConfig as OptimizationApiClientConfig,
  type ExperienceApiClient as PersonalizationApiClient,
  type InsightsApiClient as AnalyticsApiClient,
  type ExperienceApiClientConfig as PersonalizationApiClientConfig,
  type InsightsApiClientConfig as AnalyticsApiClientConfig,
} from '@contentful/optimization-api-client';

export type { PersonalizationApiClient, AnalyticsApiClient };

/** SDK-owned service vocabulary over the runtime-owned Optimization client. */
export interface ApiClient {
  readonly config: OptimizationApiClient['config'];
  readonly personalization: PersonalizationApiClient;
  readonly analytics: AnalyticsApiClient;
}

/** Stable configuration for the runtime-owned Optimization API client. */
export type OptimizationConfig = {
  personalizationBaseUrl?: PersonalizationApiClientConfig['baseUrl'];
  analyticsBaseUrl?: AnalyticsApiClientConfig['baseUrl'];
  personalizationEnabledFeatures?: PersonalizationApiClientConfig['enabledFeatures'];
  fetchOptions?: OptimizationApiClientConfig['fetchOptions'];
};

type CreateOptimizationClientOptions = OptimizationConfig & {
  spaceId: string;
  environmentId: string;
  locale?: string;
};

export function createOptimizationClient({
  spaceId,
  environmentId,
  locale,
  personalizationBaseUrl,
  analyticsBaseUrl,
  personalizationEnabledFeatures,
  fetchOptions,
}: CreateOptimizationClientOptions): ApiClient {
  const rawApi = new OptimizationApiClient({
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
  return {
    config: rawApi.config,
    personalization: rawApi.experience,
    analytics: rawApi.insights,
  };
}
