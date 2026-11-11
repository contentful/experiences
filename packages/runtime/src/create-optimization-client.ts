import {
  ApiClient as OptimizationApiClient,
  type ApiClientConfig as OptimizationApiClientConfig,
  type ExperienceApiClient as PersonalizationApiClient,
  type ExperienceApiClientConfig as PersonalizationApiClientConfig,
  type InsightsApiClient as AnalyticsApiClient,
  type InsightsApiClientConfig as AnalyticsApiClientConfig,
} from '@contentful/optimization-api-client';

/** Full Personalization and Analytics services owned by the shared runtime. */
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

type CreateRuntimeOptimizationClientOptions = OptimizationConfig & {
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
}: CreateRuntimeOptimizationClientOptions): ApiClient {
  const externalApi = new OptimizationApiClient({
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
    config: externalApi.config,
    personalization: externalApi.experience,
    analytics: externalApi.insights,
  };
}
