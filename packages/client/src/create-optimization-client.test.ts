import { ApiClient as OptimizationApiClient } from '@contentful/optimization-api-client';
import { describe, expect, it, vi } from 'vitest';

import { createRuntimeOptimizationClient } from './create-optimization-client.js';

vi.mock('@contentful/optimization-api-client', () => ({
  ApiClient: vi.fn().mockImplementation((options) => ({
    options,
    experience: { upsertProfile: vi.fn() },
    insights: { sendBatchEvents: vi.fn() },
  })),
}));

describe('createRuntimeOptimizationClient', () => {
  it('maps runtime identity and Optimization overrides to the API client', () => {
    const client = createRuntimeOptimizationClient({
      spaceId: 'space',
      environmentId: 'staging',
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
      },
      insights: { baseUrl: 'https://analytics.example' },
    });
    expect(client).toEqual({
      personalization: expect.objectContaining({ upsertProfile: expect.any(Function) }),
      analytics: expect.objectContaining({ sendBatchEvents: expect.any(Function) }),
    });
  });
});
