import { ApiClient as OptimizationApiClient } from '@contentful/optimization-api-client';
import { describe, expect, it, vi } from 'vitest';

import { createRuntimeOptimizationClient } from './create-optimization-client.js';

vi.mock('@contentful/optimization-api-client', () => ({
  ApiClient: vi.fn().mockImplementation((options) => ({ options })),
}));

describe('createRuntimeOptimizationClient', () => {
  it('maps runtime identity and Optimization overrides to the API client', () => {
    const client = createRuntimeOptimizationClient({
      spaceId: 'space',
      environmentId: 'staging',
      experienceBaseUrl: 'https://experience.example',
      insightsBaseUrl: 'https://insights.example',
      enabledFeatures: ['location'],
      fetchOptions: { retries: 3 },
    });

    expect(OptimizationApiClient).toHaveBeenCalledWith({
      spaceId: 'space',
      environment: 'staging',
      fetchOptions: { retries: 3 },
      experience: {
        baseUrl: 'https://experience.example',
        enabledFeatures: ['location'],
      },
      insights: { baseUrl: 'https://insights.example' },
    });
    expect(client).toBeDefined();
  });
});
