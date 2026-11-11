import { ApiClient as OptimizationApiClient } from '@contentful/optimization-api-client';
import { describe, expect, it, vi } from 'vitest';

import { createRuntimeOptimizationClient } from './create-optimization-client.js';

vi.mock('@contentful/optimization-api-client', () => ({
  ApiClient: vi.fn().mockImplementation((options) => ({
    config: options,
    experience: { upsertProfile: vi.fn() },
    insights: { sendBatchEvents: vi.fn() },
  })),
}));

describe('createRuntimeOptimizationClient', () => {
  it('maps runtime identity and Optimization overrides to the API client', () => {
    const client = createRuntimeOptimizationClient({
      spaceId: 'space',
      environmentId: 'staging',
      locale: 'de-DE',
      personalizationBaseUrl: 'https://personalization.example',
      analyticsBaseUrl: 'https://analytics.example',
      personalizationEnabledFeatures: ['location'],
      fetchOptions: { retries: 3 },
    });

    expect(OptimizationApiClient).toHaveBeenCalledWith({
      spaceId: 'space',
      environment: 'staging',
      fetchOptions: { retries: 3 },
      experience: {
        baseUrl: 'https://personalization.example',
        enabledFeatures: ['location'],
        locale: 'de-DE',
      },
      insights: { baseUrl: 'https://analytics.example' },
    });
    const externalApi = vi.mocked(OptimizationApiClient).mock.results[0]?.value;
    expect(client).toEqual({
      config: externalApi.config,
      personalization: externalApi.experience,
      analytics: externalApi.insights,
    });
  });
});
