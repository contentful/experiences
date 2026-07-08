/**
 * Server-side fetch of an Experience via @contentful/experience-delivery.
 * Requires SPACE_ID and CDA_TOKEN in the environment.
 *
 * Uses `view.getExperienceWithOverrides` (not `getExperience`) so the response
 * carries `extensions.sourceMap` — the personalization SDK's per-node
 * provenance table that `resolveExperience` threads onto the plan and the
 * adapter consumes at render time. Requesting `extensions.sourceMap: {}` in
 * the request body opts the response into carrying the field.
 */

import 'server-only';

import { ContentfulViewDeliveryClient } from '@contentful/experience-delivery';
import type {
  DeliveryViewSourceMap,
  ExperiencePayload,
} from '@contentful/experiences-react';

const experienceClient = new ContentfulViewDeliveryClient({ token: process.env.CDA_TOKEN! });

export interface FetchExperienceResult {
  payload: ExperiencePayload;
  sourceMap: DeliveryViewSourceMap | undefined;
}

export async function fetchExperience(
  experienceId: string,
  options: { locale?: string; preview?: boolean } = {},
): Promise<FetchExperienceResult> {
  const spaceId = process.env.SPACE_ID || '';
  const environmentId = process.env.ENVIRONMENT_ID ?? 'master';

  const response = await experienceClient.view.getExperienceWithOverrides(
    spaceId,
    environmentId,
    experienceId,
    {
      locale: options.locale,
      preview: options.preview ? 'true' : undefined,
      extensions: {
        // Opting in to the sourceMap response field. Passing `{}` is enough —
        // any value present in the request body is treated as opt-in by XDA.
        sourceMap: {},
      },
    },
  );

  const { extensions, ...rest } = response;

  return {
    // The overrides response is structurally compatible with our
    // `ExperiencePayload` — just strip the `extensions` field so it isn't
    // interpreted as node data.
    payload: rest as unknown as ExperiencePayload,
    sourceMap: extensions?.sourceMap as DeliveryViewSourceMap | undefined,
  };
}
